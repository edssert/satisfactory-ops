// 목적: Satisfactory Buildable·공유 재질 패키지를 전수 순회해 자산/의존성/재질/구성품 그래프를 NDJSON으로 생성한다.
// 사용: dotnet run --project scripts/game-assets/Cue4ParseCatalog -- catalog <Paks 디렉터리> <출력 디렉터리>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- export <Paks 디렉터리> <출력 디렉터리> <ObjectPath...>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- inspect <Paks 디렉터리> <출력 디렉터리> <PackagePath...>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- export-array <Paks 디렉터리> <출력 디렉터리> <TextureObjectPath>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- export-mesh-uv <Paks 디렉터리> <출력 디렉터리> <StaticMeshObjectPath>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- export-texture-floats <Paks 디렉터리> <출력 디렉터리> <TextureObjectPath>
// 종료: 0 성공, 1 일부 패키지 분석 실패, 2 인자/입력 오류.

using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using CUE4Parse.Compression;
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Assets.Exports.StaticMesh;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Objects.Core.Serialization;
using CUE4Parse.UE4.Versions;
using CUE4Parse_Conversion;
using CUE4Parse_Conversion.Options;
using CUE4Parse_Conversion.Textures;
using CUE4Parse_Conversion.Textures.BC;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

var mode = args.FirstOrDefault();
if ((mode == "catalog" && args.Length != 3) ||
    (mode is "export" or "inspect" && args.Length < 4) ||
    (mode == "export-array" && args.Length != 4) ||
    (mode == "export-mesh-uv" && args.Length != 4) ||
    (mode == "export-texture-floats" && args.Length != 4) ||
    mode is not ("catalog" or "export" or "inspect" or "export-array" or "export-mesh-uv" or "export-texture-floats"))
{
    Console.Error.WriteLine("사용: Cue4ParseCatalog <catalog|export|inspect|export-array|export-mesh-uv|export-texture-floats> <Paks 디렉터리> <출력 디렉터리> [ObjectPath|PackagePath...]");
    return 2;
}

var paks = Path.GetFullPath(args[1]);
var output = Path.GetFullPath(args[2]);
if (!Directory.Exists(paks))
{
    Console.Error.WriteLine($"Paks 디렉터리가 없습니다: {paks}");
    return 2;
}
Directory.CreateDirectory(output);

await ZlibHelper.InitializeAsync();
await OodleHelper.InitializeAsync(Path.Combine(AppContext.BaseDirectory, OodleHelper.OODLE_NAME_CURRENT));
var detexPath = Path.Combine(AppContext.BaseDirectory, DetexHelper.DLL_NAME);
if (!DetexHelper.LoadDll(detexPath)) throw new InvalidOperationException($"Detex 초기화 실패: {detexPath}");
DetexHelper.Initialize(detexPath);
var gameRoot = Path.GetFullPath(Path.Combine(paks, "..", "..", ".."));
var customVersionsPath = Path.Combine(gameRoot, "CommunityResources", "CustomVersions.json");
var customVersions = File.Exists(customVersionsPath)
    ? new FCustomVersionContainer((System.Text.Json.JsonSerializer.Deserialize<List<CustomVersionRow>>(
        File.ReadAllText(customVersionsPath, Encoding.Unicode),
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [])
        .Select(row => new FCustomVersion(new FGuid(row.Key.Replace("-", "")), row.Version)))
    : null;

var provider = new DefaultFileProvider(
    paks,
    SearchOption.TopDirectoryOnly,
    new VersionContainer(EGame.GAME_UE5_6, customVersions: customVersions),
    StringComparer.OrdinalIgnoreCase);
provider.Initialize();
var mounted = provider.Mount();
provider.PostMount();
provider.LoadVirtualPaths();

if (mode == "export")
{
    var session = new ExportSession { MaxDegreeOfParallelism = Math.Min(Environment.ProcessorCount, 8) };
    var loadFailures = 0;
    var loaded = 0;
    foreach (var objectPath in args.Skip(3))
    {
        try
        {
            session.Add(provider.LoadPackageObject(objectPath));
            loaded++;
        }
        catch (Exception error)
        {
            loadFailures++;
            Console.Error.WriteLine($"EXPORT=FAIL_LOAD {objectPath} {error.Message}");
        }
    }
    if (loaded == 0) return 1;
    var results = await session.RunAsync(output, new ExportOptions(EMeshFormat.Gltf2));
    foreach (var result in results)
    {
        Console.WriteLine($"EXPORT={(result.Success ? "OK" : "FAIL")} {result.ObjectPath}");
        if (result.Error is not null) Console.Error.WriteLine(result.Error);
        foreach (var file in result.DiskFilePaths ?? []) Console.WriteLine($"FILE={file}");
    }
    return loadFailures == 0 && results.All(result => result.Success) ? 0 : 1;
}

if (mode == "inspect")
{
    var inspectSettings = new JsonSerializerSettings { ReferenceLoopHandling = ReferenceLoopHandling.Ignore };
    foreach (var packagePath in args.Skip(3))
    {
        var exports = provider.LoadPackage(packagePath).GetExports();
        var json = JsonConvert.SerializeObject(exports, Formatting.Indented, inspectSettings);
        var file = Path.Combine(output, packagePath.Split('/').Last() + ".json");
        await File.WriteAllTextAsync(file, json, new UTF8Encoding(false));
        Console.WriteLine($"INSPECT={packagePath} EXPORTS={exports.Count()} FILE={file}");
    }
    return 0;
}

if (mode == "export-array")
{
    var texture = provider.LoadPackageObject<UTexture2DArray>(args[3]);
    var slices = texture.DecodeTextureArray() ?? throw new InvalidOperationException($"텍스처 배열 디코딩 실패: {args[3]}");
    for (var index = 0; index < slices.Length; index++)
    {
        var bytes = slices[index].Encode(ETextureFormat.Png, false, out var extension);
        var file = Path.Combine(output, $"{texture.Name}-slice-{index:D2}.{extension}");
        await File.WriteAllBytesAsync(file, bytes);
        Console.WriteLine($"SLICE={index} FILE={file}");
    }
    Console.WriteLine($"SLICES={slices.Length}");
    return 0;
}

if (mode == "export-mesh-uv")
{
    var mesh = provider.LoadPackageObject<UStaticMesh>(args[3]);
    var lod = mesh.RenderData?.LODs?.FirstOrDefault() ?? throw new InvalidOperationException($"LOD0 없음: {args[3]}");
    var vertexBuffer = lod.VertexBuffer ?? throw new InvalidOperationException($"VertexBuffer 없음: {args[3]}");
    var channels = Enumerable.Range(0, vertexBuffer.NumTexCoords)
        .Select(channel => vertexBuffer.UV.Select(vertex => new[] { vertex.UV[channel].U, vertex.UV[channel].V }).ToArray())
        .ToArray();
    var colors = lod.ColorVertexBuffer?.Data.Select(color => new[] { color.R, color.G, color.B, color.A }).ToArray() ?? [];
    var row = new
    {
        schemaVersion = 1,
        sourceObject = args[3],
        mesh = mesh.Name,
        lod = 0,
        vertices = vertexBuffer.NumVertices,
        texCoords = vertexBuffer.NumTexCoords,
        useFullPrecisionUVs = vertexBuffer.UseFullPrecisionUVs,
        channels,
        colors
    };
    var file = Path.Combine(output, $"{mesh.Name}-uv.json");
    await File.WriteAllTextAsync(file, System.Text.Json.JsonSerializer.Serialize(row), new UTF8Encoding(false));
    Console.WriteLine($"MESH={mesh.Name} VERTICES={vertexBuffer.NumVertices} TEXCOORDS={vertexBuffer.NumTexCoords} FILE={file}");
    return 0;
}

if (mode == "export-texture-floats")
{
    var texture = provider.LoadPackageObject<UTexture2D>(args[3]);
    var decoded = texture.Decode() ?? throw new InvalidOperationException($"텍스처 디코딩 실패: {args[3]}");
    if (decoded.PixelFormat != CUE4Parse.UE4.Assets.Exports.Texture.EPixelFormat.PF_FloatRGBA)
        throw new InvalidOperationException($"PF_FloatRGBA가 아님: {decoded.PixelFormat}");
    var pixels = new float[decoded.Width * decoded.Height][];
    for (var pixel = 0; pixel < pixels.Length; pixel++)
    {
        pixels[pixel] = Enumerable.Range(0, 4)
            .Select(channel => (float)BitConverter.UInt16BitsToHalf(BitConverter.ToUInt16(decoded.Data, (pixel * 4 + channel) * 2)))
            .ToArray();
    }
    var row = new { schemaVersion = 1, sourceObject = args[3], texture = texture.Name, decoded.Width, decoded.Height, pixels };
    var file = Path.Combine(output, $"{texture.Name}-floats.json");
    await File.WriteAllTextAsync(file, System.Text.Json.JsonSerializer.Serialize(row, new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));
    Console.WriteLine($"TEXTURE={texture.Name} SIZE={decoded.Width}x{decoded.Height} FILE={file}");
    return 0;
}

var prefixes = new[] { "FactoryGame/Content/" };
var packages = provider.Files.Values
    .Where(file => file.IsUePackage && prefixes.Any(prefix => file.Path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
    .Select(file => file.Path)
    .Where(path => path.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .Order(StringComparer.OrdinalIgnoreCase)
    .ToArray();

var graphPath = Path.Combine(output, "factory-assets.ndjson");
var failuresPath = Path.Combine(output, "factory-assets-failures.ndjson");
var summaryPath = Path.Combine(output, "factory-assets-summary.json");
await using var graph = new StreamWriter(graphPath, false, new UTF8Encoding(false));
await using var failures = new StreamWriter(failuresPath, false, new UTF8Encoding(false));
var settings = new JsonSerializerSettings { ReferenceLoopHandling = ReferenceLoopHandling.Ignore };
var serializerOptions = new JsonSerializerOptions { WriteIndented = false };
var stopwatch = Stopwatch.StartNew();
var exportTypeCounts = new Dictionary<string, int>(StringComparer.Ordinal);
var materialCount = 0;
var componentCount = 0;
var referenceCount = 0;
var failureCount = 0;

for (var index = 0; index < packages.Length; index++)
{
    var packagePath = packages[index];
    try
    {
        var exports = provider.LoadPackage(packagePath).GetExports().ToArray();
        var token = JArray.Parse(JsonConvert.SerializeObject(exports, settings));
        var exportRows = token.OfType<JObject>().Select(exportToken => new ExportRow(
            exportToken.Value<string>("Type") ?? "Unknown",
            exportToken.Value<string>("Name") ?? "Unknown")).ToArray();
        foreach (var exportRow in exportRows)
        {
            exportTypeCounts[exportRow.Type] = exportTypeCounts.GetValueOrDefault(exportRow.Type) + 1;
        }

        var references = token.Descendants()
            .OfType<JProperty>()
            .Where(property => property.Name == "ObjectPath" && property.Value.Type == JTokenType.String)
            .Select(property => property.Value.Value<string>())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        referenceCount += references.Length;

        var materials = token.OfType<JObject>()
            .Where(exportToken => IsMaterialExport(exportToken.Value<string>("Type")))
            .Select(ReadMaterial)
            .ToArray();
        materialCount += materials.Length;

        var colorSlots = token.OfType<JObject>()
            .Where(exportToken => exportToken.Value<string>("Name") == "Default__BP_BuildableSubsystem_C")
            .SelectMany(exportToken => (exportToken["Properties"]?["mColorSlots_Data"] as JArray)?.OfType<JObject>() ?? [])
            .Select((slot, slotIndex) => new ColorSlotRow(
                slotIndex,
                ToPlainValue(slot["PrimaryColor"]),
                ToPlainValue(slot["SecondaryColor"]),
                ReadObjectPath(slot["PaintFinish"])))
            .ToArray();

        var meshes = token.OfType<JObject>()
            .Where(exportToken => exportToken.Value<string>("Type") == "StaticMesh")
            .Select(exportToken => new MeshRow(
                exportToken.Value<string>("Name") ?? "Unknown",
                ToPlainValue(exportToken["Properties"]?["ExtendedBounds"])))
            .ToArray();

        var factorySettings = token.OfType<JObject>()
            .FirstOrDefault(exportToken => exportToken.Value<string>("Name") == "Default__BP_FactorySettings_C")
            is { } settingsToken
            ? ReadFactorySettings(settingsToken["Properties"] as JObject)
            : new Dictionary<string, object?>(StringComparer.Ordinal);

        var components = token.OfType<JObject>()
            .Where(exportToken =>
                (exportToken.Value<string>("Type") ?? "").Contains("Component", StringComparison.OrdinalIgnoreCase) ||
                (exportToken.Value<string>("Name") ?? "").EndsWith("_GEN_VARIABLE", StringComparison.Ordinal))
            .Select(ReadComponent)
            .ToArray();
        componentCount += components.Length;

        var row = new PackageRow(packagePath, exportRows, references!, materials, components, colorSlots, meshes, factorySettings);
        await graph.WriteLineAsync(System.Text.Json.JsonSerializer.Serialize(row, serializerOptions));
    }
    catch (Exception exception)
    {
        failureCount += 1;
        await failures.WriteLineAsync(System.Text.Json.JsonSerializer.Serialize(new
        {
            package = packagePath,
            error = exception.GetType().Name,
            message = exception.Message,
            stack = exception.StackTrace
        }, serializerOptions));
    }

    if ((index + 1) % 250 == 0 || index + 1 == packages.Length)
    {
        Console.WriteLine($"PROGRESS={index + 1}/{packages.Length} FAIL={failureCount} ELAPSED={stopwatch.Elapsed.TotalSeconds:F1}s");
    }
}

var docsPath = Path.Combine(gameRoot, "CommunityResources", "Docs", "en-US.json");
var headersPath = Path.Combine(gameRoot, "CommunityResources", "Headers.zip");
var apiContractsPath = Path.Combine(output, "factory-api-contracts.json");
var apiContracts = ReadFactoryApiContracts(headersPath);
await File.WriteAllTextAsync(apiContractsPath, System.Text.Json.JsonSerializer.Serialize(apiContracts, new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));
var summary = new
{
    schemaVersion = 1,
    generatedAtUtc = DateTimeOffset.UtcNow,
    source = new
    {
        paks,
        mounted,
        providerFiles = provider.Files.Count,
        customVersionsSha256 = File.Exists(customVersionsPath) ? Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(customVersionsPath))).ToLowerInvariant() : null,
        docsSha256 = File.Exists(docsPath) ? Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(docsPath))).ToLowerInvariant() : null,
        headersSha256 = apiContracts.SourceSha256
    },
    scopePrefixes = prefixes,
    packages = packages.Length,
    failedPackages = failureCount,
    materials = materialCount,
    components = componentCount,
    references = referenceCount,
    exportTypeCounts = exportTypeCounts.OrderByDescending(pair => pair.Value).ToDictionary(),
    elapsedSeconds = stopwatch.Elapsed.TotalSeconds,
    outputs = new { graph = Path.GetFileName(graphPath), failures = Path.GetFileName(failuresPath), apiContracts = Path.GetFileName(apiContractsPath) }
};
await File.WriteAllTextAsync(summaryPath, System.Text.Json.JsonSerializer.Serialize(summary, new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));
Console.WriteLine($"OUTPUT={graphPath}");
Console.WriteLine($"SUMMARY={summaryPath}");
Console.WriteLine($"API_CONTRACTS={apiContractsPath}");
Console.WriteLine($"PACKAGES={packages.Length} MATERIALS={materialCount} COMPONENTS={componentCount} REFERENCES={referenceCount} FAILURES={failureCount}");
return failureCount == 0 ? 0 : 1;

static MaterialRow ReadMaterial(JObject exportToken)
{
    var properties = exportToken["Properties"] as JObject;
    var cached = exportToken["CachedExpressionData"] as JObject;
    return new MaterialRow(
        exportToken.Value<string>("Name") ?? "Unknown",
        ReadObjectPath(properties?["Parent"]),
        ReadParameters(properties?["ScalarParameterValues"], "ParameterValue"),
        ReadParameters(properties?["VectorParameterValues"], "ParameterValue"),
        ReadParameters(properties?["TextureParameterValues"], "ParameterValue"),
        ReadParameters(properties?["StaticParametersRuntime"]?["StaticSwitchParameters"], "Value"),
        ReadPrimitiveData(cached),
        ReadRuntimeValues(cached, "RuntimeEntries", "ScalarValues"),
        ReadRuntimeValues(cached, "RuntimeEntries[1]", "VectorValues"),
        cached?["FunctionInfos"]?.Children().OfType<JObject>()
            .Select(token => ReadObjectPath(token["Function"]))
            .OfType<string>()
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? [],
        cached?["bHasPerInstanceCustomData"]?.Value<bool>() ?? false,
        cached?["bHasVertexInterpolator"]?.Value<bool>() ?? false,
        ReadMaterialProperties(properties));
}

static Dictionary<string, object?> ReadFactorySettings(JObject? properties)
{
    var names = new[]
    {
        "mDefaultInputConnectionMaterial",
        "mDefaultOutputConnectionMaterial",
        "mDefaultAutomaticBlueprintConnectionMaterial",
        "mDefaultNeutralConnectionMaterial",
        "mDefaultPowerConnectionMaterial",
        "mDefaultConveyorConnectionFrameMesh",
        "mDefaultConveyorConnectionArrowMesh",
        "mDefaultPipeConnectionFrameMesh",
        "mDefaultPipeConnectionArrowMesh",
        "mDefaultPowerConnectionMesh",
        "mClearanceMesh",
        "mClearanceMaterial"
    };
    return names
        .Where(name => properties?[name] is not null)
        .ToDictionary(name => name, name => ToPlainValue(properties?[name]), StringComparer.Ordinal);
}

static Dictionary<string, object?> ReadMaterialProperties(JObject? properties)
{
    var names = new[]
    {
        "BlendMode",
        "ShadingModel",
        "bDisableDepthTest",
        "AllowTranslucentCustomDepthWrites",
        "PixelDepthOffsetMode",
        "BasePropertyOverrides"
    };
    return names
        .Where(name => properties?[name] is not null)
        .ToDictionary(name => name, name => ToPlainValue(properties?[name]), StringComparer.Ordinal);
}

static HeaderContractDocument ReadFactoryApiContracts(string headersPath)
{
    if (!File.Exists(headersPath)) throw new FileNotFoundException("CommunityResources/Headers.zip가 없습니다.", headersPath);
    using var archive = ZipFile.OpenRead(headersPath);
    string Read(string entryPath)
    {
        var entry = archive.GetEntry(entryPath) ?? throw new InvalidDataException($"Headers.zip 엔트리 누락: {entryPath}");
        using var reader = new StreamReader(entry.Open(), Encoding.UTF8);
        return reader.ReadToEnd();
    }
    var settingsPath = "Source/FactoryGame/Public/FGFactorySettings.h";
    var connectionPath = "Source/FactoryGame/Public/FGFactoryConnectionComponent.h";
    var hologramPath = "Source/FactoryGame/Public/Hologram/FGBuildableHologram.h";
    var settings = Read(settingsPath);
    var connection = Read(connectionPath);
    var hologram = Read(hologramPath);
    var required = new Dictionary<string, string>
    {
        ["UFGFactorySettings.mDefaultConveyorConnectionFrameMesh"] = "mDefaultConveyorConnectionFrameMesh",
        ["UFGFactorySettings.mDefaultConveyorConnectionArrowMesh"] = "mDefaultConveyorConnectionArrowMesh",
        ["UFGFactorySettings.mDefaultInputConnectionMaterial"] = "mDefaultInputConnectionMaterial",
        ["UFGFactorySettings.mDefaultOutputConnectionMaterial"] = "mDefaultOutputConnectionMaterial",
        ["UFGFactoryConnectionComponent.GetConnectorNormal"] = "GetComponentRotation().Vector()",
        ["AFGBuildableHologram.SetupFactoryConnectionMesh"] = "SetupFactoryConnectionMesh"
    };
    foreach (var pair in required)
    {
        var text = pair.Key.StartsWith("UFGFactorySettings", StringComparison.Ordinal) ? settings
            : pair.Key.StartsWith("UFGFactoryConnectionComponent", StringComparison.Ordinal) ? connection
            : hologram;
        if (!text.Contains(pair.Value, StringComparison.Ordinal))
            throw new InvalidDataException($"Headers.zip API 심벌 드리프트: {pair.Key}");
    }
    string Hash(string text) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();
    return new HeaderContractDocument(
        1,
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(headersPath))).ToLowerInvariant(),
        [
            new(settingsPath, Hash(settings)),
            new(connectionPath, Hash(connection)),
            new(hologramPath, Hash(hologram))
        ],
        [
            new("api:UFGFactorySettings#mDefaultConveyorConnectionFrameMesh", "connection-frame-mesh", settingsPath),
            new("api:UFGFactorySettings#mDefaultConveyorConnectionArrowMesh", "connection-arrow-mesh", settingsPath),
            new("api:UFGFactorySettings#mDefaultInputConnectionMaterial", "input-connection-material", settingsPath),
            new("api:UFGFactorySettings#mDefaultOutputConnectionMaterial", "output-connection-material", settingsPath),
            new("api:UFGFactoryConnectionComponent#GetConnectorNormal", "positive-x-outward-normal", connectionPath),
            new("api:AFGBuildableHologram#SetupFactoryConnectionMesh", "connection-mesh-assembly", hologramPath)
        ]);
}

static Dictionary<string, object?> ReadRuntimeValues(JObject? cached, string entryName, string valuesName)
{
    var runtimeEntries = cached?[entryName] as JObject;
    var names = runtimeEntries?["ParameterInfoSet"]?.Children().OfType<JObject>()
        .Select(token => token["Name"]?.Value<string>())
        .ToArray() ?? [];
    var values = cached?[valuesName]?.Children().ToArray() ?? [];
    var result = new Dictionary<string, object?>(StringComparer.Ordinal);
    for (var index = 0; index < Math.Min(names.Length, values.Length); index++)
    {
        if (!string.IsNullOrWhiteSpace(names[index])) result[names[index]!] = ToPlainValue(values[index]);
    }
    return result;
}

static Dictionary<string, int> ReadPrimitiveData(JObject? cached)
{
    var runtimeEntries = cached?["RuntimeEntries"] as JObject;
    var names = runtimeEntries?["ParameterInfoSet"]?.Children()
        .Select(token => token?["Name"]?.Value<string>())
        .ToArray() ?? [];
    var indexes = cached?["ScalarPrimitiveDataIndexValues"]?.Children()
        .Select(token => token.Value<int>())
        .ToArray() ?? [];
    var result = new Dictionary<string, int>(StringComparer.Ordinal);
    for (var index = 0; index < Math.Min(names.Length, indexes.Length); index++)
    {
        if (!string.IsNullOrWhiteSpace(names[index]) && indexes[index] >= 0)
            result[names[index]!] = indexes[index];
    }
    return result;
}

static bool IsMaterialExport(string? type) => type is "Material" or "MaterialInstanceConstant" or "MaterialFunction";

static Dictionary<string, object?> ReadParameters(JToken? token, string valueName)
{
    var result = new Dictionary<string, object?>(StringComparer.Ordinal);
    foreach (var parameter in token?.OfType<JObject>() ?? [])
    {
        var name = parameter["ParameterInfo"]?["Name"]?.Value<string>();
        if (!string.IsNullOrWhiteSpace(name)) result[name] = ToPlainValue(parameter[valueName]);
    }
    return result;
}

static ComponentRow ReadComponent(JObject exportToken)
{
    var properties = exportToken["Properties"] as JObject;
    return new ComponentRow(
        exportToken.Value<string>("Type") ?? "Unknown",
        exportToken.Value<string>("Name") ?? "Unknown",
        ReadObjectPath(properties?["StaticMesh"]),
        ReadObjectPath(properties?["SkeletalMesh"]),
        ToPlainValue(properties?["RelativeLocation"]),
        ToPlainValue(properties?["RelativeRotation"]),
        ToPlainValue(properties?["RelativeScale3D"]),
        properties?["mDirection"]?.Value<string>(),
        properties?["mConnectorClearance"]?.Value<double>(),
        properties?["OverrideMaterials"]?.Children()
            .OfType<JObject>()
            .Select(child => child["ObjectPath"]?.Value<string>())
            .Where(value => value is not null)
            .ToArray());
}

static string? ReadObjectPath(JToken? token) => token is JObject value
    ? value["ObjectPath"]?.Value<string>()
    : null;

static object? ToPlainValue(JToken? token) => token switch
{
    null => null,
    JValue value => value.Value,
    JObject value => value.Properties().ToDictionary(property => property.Name, property => ToPlainValue(property.Value), StringComparer.Ordinal),
    JArray value => value.Select(ToPlainValue).ToArray(),
    _ => token.ToString(Formatting.None)
};

internal sealed record CustomVersionRow(string Key, int Version, string FriendlyName);
internal sealed record ExportRow(string Type, string Name);
internal sealed record MaterialRow(
    string Name,
    string? Parent,
    Dictionary<string, object?> Scalars,
    Dictionary<string, object?> Vectors,
    Dictionary<string, object?> Textures,
    Dictionary<string, object?> Switches,
    Dictionary<string, int> PrimitiveData,
    Dictionary<string, object?> RuntimeScalars,
    Dictionary<string, object?> RuntimeVectors,
    string[] Functions,
    bool UsesPerInstanceCustomData,
    bool UsesVertexInterpolator,
    Dictionary<string, object?> Properties);
internal sealed record ComponentRow(string Type, string Name, string? StaticMesh, string? SkeletalMesh, object? RelativeLocation, object? RelativeRotation, object? RelativeScale, string? Direction, double? ConnectorClearance, string?[]? OverrideMaterials);
internal sealed record ColorSlotRow(int Slot, object? PrimaryColor, object? SecondaryColor, string? PaintFinish);
internal sealed record MeshRow(string Name, object? Bounds);
internal sealed record PackageRow(string Package, ExportRow[] Exports, string[] References, MaterialRow[] Materials, ComponentRow[] Components, ColorSlotRow[] ColorSlots, MeshRow[] Meshes, Dictionary<string, object?> FactorySettings);
internal sealed record HeaderSourceRow(string Path, string Sha256);
internal sealed record ApiSymbolRow(string Id, string Role, string Header);
internal sealed record HeaderContractDocument(int SchemaVersion, string SourceSha256, HeaderSourceRow[] Headers, ApiSymbolRow[] Symbols);
