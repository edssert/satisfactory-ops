// 목적: 설치본 PDB/PE에서 공개 헤더에 없는 포트 시각화 native transform 계약을 결정적으로 추출한다.
// 사용: dotnet run --project scripts/game-assets/PdbNativeContracts -- <Satisfactory 루트> <출력 JSON>

using DIA;
using Iced.Intel;
using System.Reflection.PortableExecutable;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

if (args.Length != 2) return 2;
var gameRoot = Path.GetFullPath(args[0]);
var output = Path.GetFullPath(args[1]);
var binaries = Path.Combine(gameRoot, "FactoryGame", "Binaries", "Win64");
var pdb = Path.Combine(binaries, "FactoryGameSteam-FactoryGame-Win64-Shipping.pdb");
var image = Path.Combine(binaries, "FactoryGameSteam-FactoryGame-Win64-Shipping.dll");
if (!File.Exists(pdb) || !File.Exists(image)) throw new FileNotFoundException("FactoryGame PDB/DLL이 없습니다.");
var diaPath = DiaCandidates().FirstOrDefault(path => File.Exists(path) && NativeLibrary.TryLoad(path, out _))
    ?? throw new FileNotFoundException("로드 가능한 msdia140.dll이 없습니다.");

var diaHandle = NativeLibrary.Load(diaPath);
var getClassObject = Marshal.GetDelegateForFunctionPointer<DllGetClassObject>(NativeLibrary.GetExport(diaHandle, "DllGetClassObject"));
var classId = new Guid("E6756135-1E65-4D17-8576-610761398C3C");
var classFactoryId = typeof(IClassFactory).GUID;
Marshal.ThrowExceptionForHR(getClassObject(ref classId, ref classFactoryId, out var factoryPointer));
var factory = (IClassFactory)Marshal.GetObjectForIUnknown(factoryPointer);
var dataSourceId = typeof(IDiaDataSource).GUID;
factory.CreateInstance(IntPtr.Zero, ref dataSourceId, out var sourcePointer);
var source = (IDiaDataSource)Marshal.GetObjectForIUnknown(sourcePointer);
source.loadDataFromPdb(pdb);
source.openSession(out var session);
var global = session.globalScope;
var functions = session.findChildren(global, SymTagEnum.Function, null!, NameSearchOptions.None);
IDiaSymbol? symbol = null;
foreach (IDiaSymbol candidate in functions)
    if (candidate.name == "AFGBuildableHologram::SetupFactoryConnectionMesh") { symbol = candidate; break; }
if (symbol is null) throw new InvalidDataException("SetupFactoryConnectionMesh 심벌이 없습니다.");
var locals = new HashSet<string>();
foreach (IDiaSymbol local in symbol.findChildren(SymTagEnum.Data, null!, NameSearchOptions.None))
    if (local.name is { } localName) locals.Add(localName);
foreach (var required in new[] { "connectionComponent", "bUseFrameMesh", "bUseArrowMesh", "RelativeTransform", "rotation" })
    if (!locals.Contains(required)) throw new InvalidDataException($"PDB 로컬 심벌 드리프트: {required}");

var rva = symbol.relativeVirtualAddress;
var length = checked((int)symbol.length);
using var stream = File.OpenRead(image);
using var pe = new PEReader(stream, PEStreamOptions.LeaveOpen);
byte[] ReadRva(uint address, int count)
{
    var section = pe.PEHeaders.SectionHeaders.Single(value => address >= value.VirtualAddress && address < value.VirtualAddress + Math.Max(value.VirtualSize, value.SizeOfRawData));
    stream.Position = address - section.VirtualAddress + section.PointerToRawData;
    var bytes = new byte[count];
    stream.ReadExactly(bytes);
    return bytes;
}
var body = ReadRva(rva, length);
var decoder = Decoder.Create(64, new ByteArrayCodeReader(body));
decoder.IP = rva;
var instructions = new Dictionary<uint, Instruction>();
while (decoder.IP < (ulong)rva + (ulong)length)
{
    decoder.Decode(out var instruction);
    instructions[checked((uint)(instruction.IP - rva))] = instruction;
}
uint ConstantAddress(uint functionOffset, Mnemonic mnemonic)
{
    if (!instructions.TryGetValue(functionOffset, out var instruction) || instruction.Mnemonic != mnemonic || !instruction.IsIPRelativeMemoryOperand)
        throw new InvalidDataException($"SetupFactoryConnectionMesh opcode 드리프트: +0x{functionOffset:X}");
    return checked((uint)instruction.IPRelativeMemoryAddress);
}
var inputRotationRaw = ReadRva(ConstantAddress(0x44C, Mnemonic.Movaps), 16);
var outputXRaw = ReadRva(ConstantAddress(0x553, Mnemonic.Movsd), 8);
var inputXRaw = ReadRva(ConstantAddress(0x55D, Mnemonic.Movsd), 8);
var yzRaw = ReadRva(ConstantAddress(0x565, Mnemonic.Movaps), 16);
var inputRotation = new[] { BitConverter.ToDouble(inputRotationRaw, 0), BitConverter.ToDouble(inputRotationRaw, 8), 0d };
var outputX = BitConverter.ToDouble(outputXRaw);
var inputX = BitConverter.ToDouble(inputXRaw);
var y = BitConverter.ToDouble(yzRaw, 0);
var z = BitConverter.ToDouble(yzRaw, 8);
if (inputRotation is not [0d, 180d, 0d] || outputX != 150d || inputX != -150d || y != 0d || z != 70d)
    throw new InvalidDataException("SetupFactoryConnectionMesh 상수 계약 드리프트");

var clearanceCandidates = new List<object>();
foreach (IDiaSymbol candidate in session.findChildren(global, SymTagEnum.Function, null!, NameSearchOptions.None))
{
    var name = candidate.name ?? "";
    if (!name.Contains("Clearance", StringComparison.OrdinalIgnoreCase)) continue;
    if (!(name.Contains("Hologram", StringComparison.OrdinalIgnoreCase) || name.Contains("BuildGun", StringComparison.OrdinalIgnoreCase))) continue;
    var candidateLocals = new HashSet<string>();
    foreach (IDiaSymbol value in candidate.findChildren(SymTagEnum.Data, null!, NameSearchOptions.None))
        if (value.name is { } valueName) candidateLocals.Add(valueName);
    clearanceCandidates.Add(new {
        name,
        undecoratedName = candidate.undecoratedName,
        rva = $"0x{candidate.relativeVirtualAddress:X}",
        length = candidate.length,
        locals = candidateLocals.Order().ToArray(),
    });
}

var document = new
{
    schemaVersion = 1,
    source = new {
        pdb = Path.GetRelativePath(gameRoot, pdb).Replace('\\', '/'),
        pdbSha256 = Hash(pdb),
        image = Path.GetRelativePath(gameRoot, image).Replace('\\', '/'),
        imageSha256 = Hash(image),
        dia = diaPath,
    },
    setupFactoryConnectionMesh = new {
        symbol = symbol.undecoratedName,
        rva = $"0x{rva:X}",
        length,
        localSymbols = locals.Order().ToArray(),
        frame = new { relativeTranslationCm = new[] { 0d, 0d, 0d }, relativeRotationDeg = new[] { 0d, 0d, 0d }, authoredPivot = true },
        inputArrow = new { relativeTranslationCm = new[] { inputX, y, z }, relativeRotationDeg = inputRotation },
        outputArrow = new { relativeTranslationCm = new[] { outputX, y, z }, relativeRotationDeg = new[] { 0d, 0d, 0d } },
    }
    ,clearanceCandidates
};
Directory.CreateDirectory(Path.GetDirectoryName(output)!);
await File.WriteAllTextAsync(output, JsonSerializer.Serialize(document, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"PASS  SetupFactoryConnectionMesh PDB 계약 · RVA 0x{rva:X} · {length} bytes");
Console.WriteLine($"PASS  Clearance native 후보 {clearanceCandidates.Count}개");
Console.WriteLine($"OUTPUT={output}");
return 0;

static string Hash(string path) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant();
static IEnumerable<string> DiaCandidates()
{
    var sdkRoot = @"C:\Program Files\dotnet\sdk";
    if (Directory.Exists(sdkRoot))
        foreach (var sdk in Directory.GetDirectories(sdkRoot).OrderDescending())
            yield return Path.Combine(sdk, "TestHostNetFramework", "x64", "msdia140.dll");
    yield return @"C:\Program Files (x86)\Windows Kits\10\Windows Performance Toolkit\msdia140.dll";
    yield return @"C:\Program Files (x86)\Steam\bin\cef\cef.win64\msdia140.dll";
}

[UnmanagedFunctionPointer(CallingConvention.StdCall)]
delegate int DllGetClassObject(ref Guid classId, ref Guid interfaceId, out IntPtr instance);
[ComImport, Guid("00000001-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IClassFactory
{
    void CreateInstance(IntPtr outer, ref Guid interfaceId, out IntPtr instance);
    void LockServer([MarshalAs(UnmanagedType.Bool)] bool value);
}
