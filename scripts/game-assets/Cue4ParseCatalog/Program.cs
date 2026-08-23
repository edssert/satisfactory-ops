// 목적: Satisfactory Buildable·공유 재질 패키지를 전수 순회해 자산/의존성/재질/구성품 그래프를 NDJSON으로 생성한다.
// 사용: dotnet run --project scripts/game-assets/Cue4ParseCatalog -- catalog <Paks 디렉터리> <출력 디렉터리>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- export <Paks 디렉터리> <출력 디렉터리> <ObjectPath...>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- inspect <Paks 디렉터리> <출력 디렉터리> <PackagePath...>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- export-array <Paks 디렉터리> <출력 디렉터리> <TextureObjectPath>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- export-mesh-uv <Paks 디렉터리> <출력 디렉터리> <StaticMeshObjectPath>
//       dotnet run --project scripts/game-assets/Cue4ParseCatalog -- export-texture-floats <Paks 디렉터리> <출력 디렉터리> <TextureObjectPath>
// 종료: 0 성공, 1 일부 패키지 분석 실패, 2 인자/입력 오류.

using System.Diagnostics;
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

var prefixes = new[]
{
    "FactoryGame/Content/FactoryGame/Buildable/",
    "FactoryGame/Content/FactoryGame/-Shared/Material/",
    "FactoryGame/Content/FactoryGame/-Shared/Texture/",
    "FactoryGame/Content/FactoryGame/MasterMaterials/",
    "FactoryGame/Content/FactoryGame/Developers/deHulluB/UVS/"
};
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

        var components = token.OfType<JObject>()
            .Where(exportToken =>
                (exportToken.Value<string>("Type") ?? "").Contains("Component", StringComparison.OrdinalIgnoreCase) ||
                (exportToken.Value<string>("Name") ?? "").EndsWith("_GEN_VARIABLE", StringComparison.Ordinal))
            .Select(ReadComponent)
            .ToArray();
        componentCount += components.Length;

        var row = new PackageRow(packagePath, exportRows, references!, materials, components);
        await graph.WriteLineAsync(System.Text.Json.JsonSerializer.Serialize(row, serializerOptions));
    }
    catch (Exception exception)
    {
        failureCount += 1;
        await failures.WriteLineAsync(System.Text.Json.JsonSerializer.Serialize(new
        {
            package = packagePath,
            error = exception.GetType().Name,
            message = exception.Message
        }, serializerOptions));
    }

    if ((index + 1) % 250 == 0 || index + 1 == packages.Length)
    {
        Console.WriteLine($"PROGRESS={index + 1}/{packages.Length} FAIL={failureCount} ELAPSED={stopwatch.Elapsed.TotalSeconds:F1}s");
    }
}

var docsPath = Path.Combine(gameRoot, "CommunityResources", "Docs", "en-US.json");
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
        docsSha256 = File.Exists(docsPath) ? Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(docsPath))).ToLowerInvariant() : null
    },
    scopePrefixes = prefixes,
    packages = packages.Length,
    failedPackages = failureCount,
    materials = materialCount,
    components = componentCount,
    references = referenceCount,
    exportTypeCounts = exportTypeCounts.OrderByDescending(pair => pair.Value).ToDictionary(),
    elapsedSeconds = stopwatch.Elapsed.TotalSeconds,
    outputs = new { graph = Path.GetFileName(graphPath), failures = Path.GetFileName(failuresPath) }
};
await File.WriteAllTextAsync(summaryPath, System.Text.Json.JsonSerializer.Serialize(summary, new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));
Console.WriteLine($"OUTPUT={graphPath}");
Console.WriteLine($"SUMMARY={summaryPath}");
Console.WriteLine($"PACKAGES={packages.Length} MATERIALS={materialCount} COMPONENTS={componentCount} REFERENCES={referenceCount} FAILURES={failureCount}");
return failureCount == 0 ? 0 : 1;

static MaterialRow ReadMaterial(JObject exportToken)
{
    var properties = exportToken["Properties"] as JObject;
    return new MaterialRow(
        exportToken.Value<string>("Name") ?? "Unknown",
        properties?["Parent"]?["ObjectPath"]?.Value<string>(),
        ReadParameters(properties?["ScalarParameterValues"], "ParameterValue"),
        ReadParameters(properties?["VectorParameterValues"], "ParameterValue"),
        ReadParameters(properties?["TextureParameterValues"], "ParameterValue"),
        ReadParameters(properties?["StaticParametersRuntime"]?["StaticSwitchParameters"], "Value"));
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
internal sealed record MaterialRow(string Name, string? Parent, Dictionary<string, object?> Scalars, Dictionary<string, object?> Vectors, Dictionary<string, object?> Textures, Dictionary<string, object?> Switches);
internal sealed record ComponentRow(string Type, string Name, string? StaticMesh, string? SkeletalMesh, object? RelativeLocation, object? RelativeRotation, object? RelativeScale, string?[]? OverrideMaterials);
internal sealed record PackageRow(string Package, ExportRow[] Exports, string[] References, MaterialRow[] Materials, ComponentRow[] Components);
