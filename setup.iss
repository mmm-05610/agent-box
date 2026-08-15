; agent-box GUI — Inno Setup installer script
; Inno Setup 6+ required: https://jrsoftware.org/isinfo.php

#define MyAppName "Agent Box"
#define MyAppVersion "1.7.6"  ; x-release-please-version
#define MyAppPublisher "mmm-05610"
#define MyAppURL "https://github.com/mmm-05610/agent-box"
#define MyAppExeName "agent-box-gui.exe"

[Setup]
AppId={{9B3F8C72-A5E2-4D11-B7C8-F3A2E9D1B064}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\AgentBox
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; LicenseFile=LICENSE
OutputDir=dist
OutputBaseFilename=agent-box-setup-{#MyAppVersion}
SetupIconFile=assets/logo.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Ask for admin rights — needed for WSL interaction
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; Force-close a running agent-box when the silent updater installs
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkablealone

[Files]
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets/logo.ico"; DestDir: "{app}\assets"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets/logo.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets/logo.ico"; Tasks: desktopicon

[Run]
; 不再自动拉起新版本。沿「旧GUI → 安装器 → 新GUI」进程链泄漏的
; _PYI_APPLICATION_HOME_DIR（PyInstaller onefile 解压目录指针）会让新 GUI
; 复用旧解压目录、读到旧版本号（或 bootloader 报变量未定义）。改为安装完成
; 后由安装器弹框提醒用户手动重开 —— 从桌面双击 = 干净进程树，版本号一定正确。

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    MsgBox('Agent Box 安装完成，请打开 Agent Box。', mbInformation, MB_OK);
end;
