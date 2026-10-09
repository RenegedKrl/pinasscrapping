const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appData = process.env.APPDATA;
const startupFolder = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const shortcutPath = path.join(startupFolder, 'PinasProspector.lnk');
const vbsScript = path.join(__dirname, '..', 'INICIAR_SILENCIOSO.vbs');
const workingDir = path.join(__dirname, '..');

const vbsCreator = path.join(process.env.TEMP || '.', 'create_shortcut_temp.vbs');
const vbsCode = [
  'Set oWS = WScript.CreateObject("WScript.Shell")',
  `sLinkFile = "${shortcutPath.replace(/\\/g, '\\\\')}"`,
  'Set oLink = oWS.CreateShortcut(sLinkFile)',
  'oLink.TargetPath = "wscript.exe"',
  `oLink.Arguments = """${vbsScript.replace(/\\/g, '\\\\')}"""`,
  `oLink.WorkingDirectory = "${workingDir.replace(/\\/g, '\\\\')}"`,
  'oLink.Description = "Pinas Prospector 24/7 Autonomo"',
  'oLink.Save'
].join('\r\n');

fs.writeFileSync(vbsCreator, vbsCode, 'utf8');
try {
  execSync(`cscript //nologo "${vbsCreator}"`);
  console.log('✅ Atalho criado com sucesso em:', shortcutPath);
} catch (err) {
  console.error('Erro ao criar atalho:', err.message);
} finally {
  try { fs.unlinkSync(vbsCreator); } catch (e) {}
}
