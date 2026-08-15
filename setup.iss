; agent-box GUI — Inno Setup installer script
; Inno Setup 6+ required: https://jrsoftware.org/isinfo.php

#define MyAppName "Agent Box"
#define MyAppVersion "1.7.4"  ; x-release-please-version
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
Filename: "{cmd}"; Parameters: "/c set _MEIPASS=& set _MEIPASS2=& set _PYI_APPLICATION_HOME_DIR=& set PYTHONPATH=& start """" ""{app}\{#MyAppExeName}"""; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall runhidden
