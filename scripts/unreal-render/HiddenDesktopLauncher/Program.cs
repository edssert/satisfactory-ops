using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    static int Main(string[] args)
    {
        if (args.Length < 1) return 2;
        var executable = Path.GetFullPath(args[0]);
        var desktopName = $"SatisfactoryOpsCapture-{Guid.NewGuid():N}";
        var desktop = CreateDesktop(desktopName, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000, IntPtr.Zero);
        if (desktop == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateDesktop");
        var desktopPointer = Marshal.StringToHGlobalUni($"WinSta0\\{desktopName}");
        try
        {
            var commandLine = new StringBuilder(string.Join(" ", new[] { Quote(executable) }.Concat(args.Skip(1).Select(Quote))));
            var startup = new STARTUPINFO { cb = Marshal.SizeOf<STARTUPINFO>(), lpDesktop = desktopPointer };
            if (!CreateProcess(executable, commandLine, IntPtr.Zero, IntPtr.Zero, false, 0x00000400, IntPtr.Zero, null, ref startup, out var process))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateProcess");
            try
            {
                WaitForSingleObject(process.hProcess, 0xffffffff);
                if (!GetExitCodeProcess(process.hProcess, out var exitCode)) throw new Win32Exception(Marshal.GetLastWin32Error());
                return checked((int)exitCode);
            }
            finally
            {
                CloseHandle(process.hThread);
                CloseHandle(process.hProcess);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(desktopPointer);
            CloseDesktop(desktop);
        }
    }

    static string Quote(string value)
    {
        if (!value.Any(char.IsWhiteSpace) && !value.Contains('"')) return value;
        var result = new StringBuilder("\"");
        var slashes = 0;
        foreach (var character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') result.Append('\\', slashes * 2 + 1).Append('"');
            else result.Append('\\', slashes).Append(character);
            slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }

    [StructLayout(LayoutKind.Sequential)]
    struct STARTUPINFO
    {
        public int cb; public IntPtr lpReserved, lpDesktop, lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public ushort wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devmode, int flags, uint access, IntPtr attrs);
    [DllImport("user32.dll", SetLastError = true)] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string? currentDirectory, ref STARTUPINFO startup, out PROCESS_INFORMATION process);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
}
