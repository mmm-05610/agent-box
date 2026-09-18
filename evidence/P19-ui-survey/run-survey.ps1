param([string]$Shots = 'C:\Users\maoqh\ui-survey\shots')
$env:AGENTBOX_SERVER_SOURCE_ROOT = '\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box-server-round1'
$env:AGENTBOX_SERVER_LINUX_ROOT  = '/home/maoqh/projects/agent-box-server-round1'
$env:AGENTBOX_UI_GATE_DEPLOYMENT = '\\wsl.localhost\Ubuntu\home\maoqh\.agentbox-ui-manual\pi-ui-deployment.json'
$env:AGENTBOX_UI_GATE_MOUNTS     = 'pi-runtime=/home/maoqh/.agentbox-ui-manual/artifacts/pi-runtime'
$env:AGENTBOX_UI_GATE_PORT       = '18776'
Set-Location 'C:\Users\maoqh\agentbox-wsl-round1\apps\desktop'
node e2e\p42-ui-survey.mjs 'C:\Users\maoqh\ui-survey' 'C:\Users\maoqh\ui-survey\out' --shots $Shots @args
