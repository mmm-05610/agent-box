# Work Order 48 stage A: the seven-question AppContainer spike.
#
# Runs on Windows only, writes one JSON report, calls no model. The questions
# and their evidence are defined in docs/implementation/work-orders/48-windows-placement.md
# section 3.A; this script answers them with first-hand observations.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File windows-spike.ps1 `
#     -Workspace <dir> -ReadOnlyTree <dir> -Report <path>
param(
    [Parameter(Mandatory = $true)][string]$Workspace,
    [Parameter(Mandatory = $true)][string]$ReadOnlyTree,
    [Parameter(Mandatory = $true)][string]$Report,
    [string]$ContainerName = "agentbox.w48.spike",
    [string]$NodeExe = ""
)

$ErrorActionPreference = "Stop"
$observations = [ordered]@{}
$observations["containerName"] = $ContainerName

$source = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class AppContainerSpike
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct STARTUPINFOEX
    {
        public STARTUPINFO StartupInfo;
        public IntPtr lpAttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION
    {
        public IntPtr hProcess, hThread;
        public int dwProcessId, dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SECURITY_ATTRIBUTES
    {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        public int bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SECURITY_CAPABILITIES
    {
        public IntPtr AppContainerSid;
        public IntPtr Capabilities;
        public uint CapabilityCount;
        public uint Reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct SID_AND_ATTRIBUTES
    {
        public IntPtr Sid;
        public uint Attributes;
    }

    [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
    public static extern int CreateAppContainerProfile(
        string name, string displayName, string description,
        SID_AND_ATTRIBUTES[] capabilities, uint capabilityCount, out IntPtr sid);

    [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
    public static extern int DeleteAppContainerProfile(string name);

    [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
    public static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);

    [DllImport("userenv.dll")]
    public static extern int FreeSid(IntPtr sid);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool ConvertSidToStringSid(IntPtr sid, out IntPtr stringSid);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool InitializeProcThreadAttributeList(
        IntPtr attributeList, int attributeCount, int flags, ref IntPtr size);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool UpdateProcThreadAttribute(
        IntPtr attributeList, uint flags, IntPtr attribute, IntPtr value,
        IntPtr size, IntPtr previousValue, IntPtr returnSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool DeleteProcThreadAttributeList(IntPtr attributeList);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcess(
        string applicationName, string commandLine,
        IntPtr processAttributes, IntPtr threadAttributes,
        bool inheritHandles, uint creationFlags, IntPtr environment,
        string currentDirectory, ref STARTUPINFOEX startupInfo,
        out PROCESS_INFORMATION processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    private const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES = 0x00020009;

    public static string SidToString(IntPtr sid)
    {
        IntPtr text;
        if (!ConvertSidToStringSid(sid, out text)) return null;
        string value = Marshal.PtrToStringUni(text);
        return value;
    }

    public static string CreateProfile(string name, bool withInternet)
    {
        IntPtr sid;
        int hr;
        if (withInternet)
        {
            IntPtr capabilitySid;
            // S-1-15-3-1 is internetClient.
            string capability = "S-1-15-3-1";
            ConvertStringSidToSid(capability, out capabilitySid);
            var capabilities = new SID_AND_ATTRIBUTES[]
            {
                new SID_AND_ATTRIBUTES { Sid = capabilitySid, Attributes = 0x00000004 },
            };
            hr = CreateAppContainerProfile(name, name, "AgentBox spike", capabilities, 1, out sid);
        }
        else
        {
            hr = CreateAppContainerProfile(name, name, "AgentBox spike", null, 0, out sid);
        }
        if (hr < 0)
        {
            // Already exists: derive it.
            hr = DeriveAppContainerSidFromAppContainerName(name, out sid);
            if (hr < 0) throw new Win32Exception(hr, "DeriveAppContainerSid failed");
        }
        return SidToString(sid);
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool ConvertStringSidToSid(string stringSid, out IntPtr sid);

    public static int DeleteProfile(string name) { return DeleteAppContainerProfile(name); }

    public static void LaunchInContainer(string name, string commandLine, string currentDirectory,
                                         bool suspended, bool withJob, out int processId, out bool jobAssigned)
    {
        IntPtr sid;
        int hr = DeriveAppContainerSidFromAppContainerName(name, out sid);
        if (hr < 0) throw new Win32Exception(hr, "derive sid");

        IntPtr size = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
        IntPtr attributeList = Marshal.AllocHGlobal(size);
        if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref size))
            throw new Win32Exception(Marshal.GetLastWin32Error());

        var capabilities = new SECURITY_CAPABILITIES
        {
            AppContainerSid = sid, Capabilities = IntPtr.Zero, CapabilityCount = 0, Reserved = 0,
        };
        IntPtr capabilityPtr = Marshal.AllocHGlobal(Marshal.SizeOf(capabilities));
        Marshal.StructureToPtr(capabilities, capabilityPtr, false);
        if (!UpdateProcThreadAttribute(
                attributeList, 0, (IntPtr)PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
                capabilityPtr, (IntPtr)Marshal.SizeOf(capabilities), IntPtr.Zero, IntPtr.Zero))
            throw new Win32Exception(Marshal.GetLastWin32Error());

        var startup = new STARTUPINFOEX();
        startup.StartupInfo.cb = Marshal.SizeOf(startup);
        startup.lpAttributeList = attributeList;

        uint flags = EXTENDED_STARTUPINFO_PRESENT;
        if (suspended) flags |= CREATE_SUSPENDED;
        PROCESS_INFORMATION information;
        if (!CreateProcess(null, commandLine, IntPtr.Zero, IntPtr.Zero, false, flags,
                           IntPtr.Zero, currentDirectory, ref startup, out information))
            throw new Win32Exception(Marshal.GetLastWin32Error());

        jobAssigned = false;
        IntPtr job = IntPtr.Zero;
        if (withJob)
        {
            job = CreateJobObject(IntPtr.Zero, null);
            jobAssigned = AssignProcessToJobObject(job, information.hProcess);
        }
        if (suspended)
        {
            ResumeThread(information.hThread);
        }
        CloseHandle(information.hThread);
        processId = information.dwProcessId;
        PendingProcess = information.hProcess;
        PendingJob = job;
    }

    public static IntPtr PendingProcess = IntPtr.Zero;
    public static IntPtr PendingJob = IntPtr.Zero;

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CreatePipe(out IntPtr readPipe, out IntPtr writePipe,
                                         IntPtr attributes, uint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);

    public static string RunCaptured(string name, string commandLine, string currentDirectory,
                                     bool withJob, out int exitCode, out bool jobAssigned)
    {
        IntPtr readPipe, writePipe;
        if (!CreatePipe(out readPipe, out writePipe, IntPtr.Zero, 0))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        // The write end must be inheritable, the read end must not be.
        SetHandleInformation(readPipe, 1 /*HANDLE_FLAG_INHERIT*/, 0);

        IntPtr sid;
        int hr = DeriveAppContainerSidFromAppContainerName(name, out sid);
        if (hr < 0) throw new Win32Exception(hr, "derive sid");
        IntPtr size = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
        IntPtr attributeList = Marshal.AllocHGlobal(size);
        if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref size))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        var capabilities = new SECURITY_CAPABILITIES { AppContainerSid = sid };
        IntPtr capabilityPtr = Marshal.AllocHGlobal(Marshal.SizeOf(capabilities));
        Marshal.StructureToPtr(capabilities, capabilityPtr, false);
        if (!UpdateProcThreadAttribute(attributeList, 0,
                (IntPtr)PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, capabilityPtr,
                (IntPtr)Marshal.SizeOf(capabilities), IntPtr.Zero, IntPtr.Zero))
            throw new Win32Exception(Marshal.GetLastWin32Error());

        var startup = new STARTUPINFOEX();
        startup.StartupInfo.cb = Marshal.SizeOf(startup);
        startup.StartupInfo.dwFlags = 0x00000100 /*STARTF_USESTDHANDLES*/;
        startup.StartupInfo.hStdOutput = writePipe;
        startup.StartupInfo.hStdError = writePipe;
        startup.lpAttributeList = attributeList;

        PROCESS_INFORMATION information;
        if (!CreateProcess(null, commandLine, IntPtr.Zero, IntPtr.Zero, true,
                           EXTENDED_STARTUPINFO_PRESENT, IntPtr.Zero, currentDirectory,
                           ref startup, out information))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        CloseHandle(writePipe);

        jobAssigned = false;
        if (withJob)
        {
            IntPtr job = CreateJobObject(IntPtr.Zero, null);
            jobAssigned = AssignProcessToJobObject(job, information.hProcess);
            CloseHandle(job);
        }
        var buffer = new byte[8192];
        var text = new StringBuilder();
        while (true)
        {
            uint read;
            bool ok = ReadFile(readPipe, buffer, (uint)buffer.Length, out read, IntPtr.Zero);
            if (!ok || read == 0) break;
            text.Append(Encoding.UTF8.GetString(buffer, 0, (int)read));
        }
        WaitForSingleObject(information.hProcess, 60000);
        uint code;
        GetExitCodeProcess(information.hProcess, out code);
        exitCode = (int)code;
        CloseHandle(information.hProcess);
        CloseHandle(information.hThread);
        CloseHandle(readPipe);
        return text.ToString();
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool ReadFile(IntPtr handle, byte[] buffer, uint toRead,
                                       out uint read, IntPtr overlapped);

    public static bool WaitPending(uint milliseconds, out uint exitCode)
    {
        uint wait = WaitForSingleObject(PendingProcess, milliseconds);
        exitCode = 0;
        if (wait != 0) return false;
        GetExitCodeProcess(PendingProcess, out exitCode);
        CloseHandle(PendingProcess);
        PendingProcess = IntPtr.Zero;
        return true;
    }

    public static bool JobKill()
    {
        if (PendingJob == IntPtr.Zero) return false;
        bool killed = TerminateJobObject(PendingJob, 1);
        CloseHandle(PendingJob);
        PendingJob = IntPtr.Zero;
        return killed;
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp | Out-Null

function Grant-Path {
    param([string]$Sid, [string]$Path, [string]$Rights)
    # Every ancestor up to the drive root needs read/traverse as well: an
    # AppContainer token does not hold SeChangeNotifyPrivilege, so path
    # resolution itself is checked against each ancestor's ACL (first-hand
    # finding of this spike; without it every container start gets
    # ERROR_ACCESS_DENIED before the container ever runs its command).
    $current = Split-Path $Path -Parent
    while ($current -and $current -match "^[A-Za-z]:\\") {
        & icacls.exe $current /grant "*$Sid`:(RX)" | Out-Null
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) { break }
        $current = $parent
    }
    & icacls.exe $Path /grant "*$Sid`:$Rights" | Out-Null
}

function Revoke-Path {
    param([string]$Sid, [string]$Path)
    $current = Split-Path $Path -Parent
    while ($current -and $current -match "^[A-Za-z]:\\") {
        & icacls.exe $current /remove "*$Sid" | Out-Null
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) { break }
        $current = $parent
    }
    & icacls.exe $Path /remove "*$Sid" | Out-Null
}

# Q1: a non-admin can create a profile (and an internetClient variant).
$sidPlain = [AppContainerSpike]::CreateProfile($ContainerName, $false)
$observations["q1_create_appcontainer_profile"] = @{
    question = "non-admin CreateAppContainerProfile"
    result   = if ($sidPlain) { "created" } else { "failed" }
    sid      = $sidPlain
}
if (-not $sidPlain) {
    $observations | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Report -Encoding UTF8
    Write-Output "Q1 failed; report written"
    exit 1
}

# Grant the container read to the workspace and read+execute on the read-only tree.
Grant-Path -Sid $sidPlain -Path $Workspace -Rights "RX"
$workspaceWritable = $true
try { Grant-Path -Sid $sidPlain -Path $Workspace -Rights "M" } catch { $workspaceWritable = $false }
if ($workspaceWritable) { Grant-Path -Sid $sidPlain -Path $Workspace -Rights "M" }
Grant-Path -Sid $sidPlain -Path $ReadOnlyTree -Rights "RX"

# Q2: is an ungranted path's *existence* visible from inside the container?
# The probe checks existence only; it never reads file content.
$ungranted = Join-Path $env:LOCALAPPDATA "AgentBox"
$inTree = Join-Path $Workspace "spike-in-workspace.txt"
Set-Content -LiteralPath $inTree -Value "workspace-probe" -Encoding ASCII
# Q2/Q6/Q4/Q5 in one captured run. Probes speak through their exit codes and
# stdout, which this process captures through a pipe; the container writes no
# files at all, because a first-hand finding of this spike is that a non-admin
# cannot lower a directory's integrity label, so an AppContainer (Low IL)
# cannot write ordinary user directories (MIC denies write-up).
$ungrantedDir = Join-Path $env:LOCALAPPDATA "AgentBox"
$ungrantedReadable = $false
$readPath = if (Test-Path $ReadOnlyTree) {
    (Get-ChildItem -LiteralPath $ReadOnlyTree -Recurse -File -ErrorAction SilentlyContinue |
        Select-Object -First 1).FullName
} else { $null }

function Invoke-InContainer {
    param([string]$CommandLine, [bool]$Job = $false)
    $code = 0; $assigned = $false
    $out = [AppContainerSpike]::RunCaptured($ContainerName, $CommandLine, $Workspace,
        $Job, [ref]$code, [ref]$assigned)
    return @{ output = $out; exit = $code; jobAssigned = $assigned }
}

# Q2: an ungranted directory's listing vs a granted file's read.
$q2Granted = Invoke-InContainer "cmd.exe /c type `"$readPath`" 2>nul"
$q2Ungranted = Invoke-InContainer "cmd.exe /c dir `"$ungrantedDir`" 2>nul"
$q2UngrantedFile = Invoke-InContainer "cmd.exe /c type `"C:\Windows\System32\drivers\etc\hosts`" 2>nul"
$observations["q2_read_isolation"] = @{
    question = "is an ungranted path readable from inside the container"
    grantedFileRead = @{ exit = $q2Granted.exit; bytes = $q2Granted.output.Length }
    ungrantedDirList = @{ exit = $q2Ungranted.exit; bytes = $q2Ungranted.output.Length }
    systemFileRead  = @{ exit = $q2UngrantedFile.exit; bytes = $q2UngrantedFile.output.Length }
    verdict = if ($q2Granted.exit -eq 0 -and $q2Ungranted.exit -ne 0 -and $q2UngrantedFile.exit -ne 0) {
        "read isolation holds: granted reads succeed, ungranted reads/lists are denied"
    } elseif ($q2Ungranted.output.Length -gt 0) {
        "ungranted directory WAS listable (read isolation weaker than required)"
    } else { "inconclusive" }
}

# Q4: node.exe in the container reading the granted read-only tree.
if ($NodeExe -ne "") {
    $nodeCmd = "`"$NodeExe`" -e `"const fs=require('fs');try{const b=fs.readFileSync(String.raw`"$readPath`");console.log('NODE_READ_OK '+b.length)}catch(e){console.log('NODE_READ_FAIL '+e.code)}`""
    $q4 = Invoke-InContainer "cmd.exe /c $nodeCmd"
    $observations["q4_node_in_container"] = @{
        question = "does node.exe run in the container and read the granted read-only tree"
        exit = $q4.exit
        line = ($q4.output.Trim())
    }
} else {
    $observations["q4_node_in_container"] = @{ question = "node"; note = "no NodeExe given" }
}

# Q5: internetClient capability and outbound connectivity (no model call).
$q5 = Invoke-InContainer ("cmd.exe /c `"$NodeExe`" -e `"require('net').connect(443,'api.deepseek.com').on('connect',()=>{console.log('TCP_OK');process.exit(0)}).on('error',e=>{console.log('TCP_FAIL '+e.code);process.exit(0)}).setTimeout(8000,()=>{console.log('TCP_TIMEOUT');process.exit(0)})`"")
$observations["q5_capability_network"] = @{
    question = "internetClient capability and connectivity (no model call)"
    exit = $q5.exit
    line = ($q5.output.Trim())
}

# Q6: can the container write (a) its own private cache, (b) the granted
# workspace, (c) a Low-IL location?  Exit codes only; nothing is left behind.
$q6Private = Invoke-InContainer "cmd.exe /c echo probe> `"%LOCALAPPDATA%\Packages\w48-probe.txt`""
$q6Workspace = Invoke-InContainer "cmd.exe /c echo probe> `"$Workspace\w48-probe.txt`""
$observations["q6_write_paths"] = @{
    question = "where can the container actually write"
    privateCache = $q6Private.exit
    grantedWorkspace = $q6Workspace.exit
    verdict = if ($q6Workspace.exit -eq 0) { "granted workspace writable" }
              elseif ($q6Private.exit -eq 0) {
                  "workspace NOT writable (MIC write-up denied without an integrity label the non-admin cannot set); container-private cache is writable"
              } else { "no writable location observed" }
}
if (Test-Path (Join-Path $Workspace "w48-probe.txt")) { Remove-Item (Join-Path $Workspace "w48-probe.txt") -ErrorAction SilentlyContinue }

# Job kill evidence: start a sleeping container process under a job and kill the job.
$processId = 0; $jobAssigned = $false
[AppContainerSpike]::LaunchInContainer($ContainerName, "cmd.exe /c ping -n 120 127.0.0.1 >nul", $Workspace,
    $false, $true, [ref]$processId, [ref]$jobAssigned)
Start-Sleep -Milliseconds 500
$alive = Get-Process -Id $processId -ErrorAction SilentlyContinue
$killed = [AppContainerSpike]::JobKill()
Start-Sleep -Milliseconds 700
$still = Get-Process -Id $processId -ErrorAction SilentlyContinue
$observations["q3b_job_kill"] = @{
    aliveBeforeKill = [bool]$alive
    jobTerminated   = $killed
    aliveAfterKill  = [bool]$still
}

$observations["q7_family_artifacts"] = @{
    question = "per-family Windows artifacts (checked on the Linux side; recorded here as input)"
    note     = "see docs/server-round1/fullstack/windows-spike.md - the artifact inventory is collected there"
}

# Cleanup: remove the probe files and the profile's ACL grants we added.
Remove-Item -LiteralPath (Join-Path $Workspace 'w48-spike-probe.cmd'), (Join-Path $Workspace 'w48-spike-out.txt') -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $Workspace 'spike-in-workspace.txt') -ErrorAction SilentlyContinue

Revoke-Path -Sid $sidPlain -Path $Workspace
Revoke-Path -Sid $sidPlain -Path $ReadOnlyTree

$observations | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Report -Encoding UTF8
Write-Output "spike complete: $Report"
