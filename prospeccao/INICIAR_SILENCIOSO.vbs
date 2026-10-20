Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Determinar pasta onde server.js esta localizado
Dim targetDir
If fso.FileExists(currentDir & "\server.js") Then
    targetDir = currentDir
ElseIf fso.FileExists(currentDir & "\prospeccao\server.js") Then
    targetDir = currentDir & "\prospeccao"
Else
    targetDir = "G:\Users\kauek\Desktop\claude\Pinas Scrapping\prospeccao"
End If

' Determinar caminho do executavel do Node.js
Dim nodeExe
If fso.FileExists("G:\Programas\nodejs\node.exe") Then
    nodeExe = """G:\Programas\nodejs\node.exe"""
ElseIf fso.FileExists("C:\Program Files\nodejs\node.exe") Then
    nodeExe = """C:\Program Files\nodejs\node.exe"""
ElseIf fso.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
    nodeExe = """C:\Program Files (x86)\nodejs\node.exe"""
Else
    nodeExe = "node"
End If

' Evitar iniciar em duplicidade se a porta 3333 ja estiver em uso
On Error Resume Next
Dim oExec, strOutput
Set oExec = WshShell.Exec("cmd /c netstat -ano | findstr :3333 | findstr LISTENING")
strOutput = oExec.StdOut.ReadAll()
If InStr(strOutput, ":3333") > 0 Then
    WScript.Quit 0
End If
On Error GoTo 0

WshShell.CurrentDirectory = targetDir
Dim runCmd
runCmd = "cmd /c set PATH=G:\Programas\nodejs;C:\Program Files\nodejs;%PATH% && " & nodeExe & " server.js >> server_background.log 2>&1"
WshShell.Run runCmd, 0, False
