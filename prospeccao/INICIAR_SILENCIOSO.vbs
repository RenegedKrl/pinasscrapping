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

' Evitar iniciar em duplicidade se o supervisor.js ja estiver rodando (100% silencioso via WMI)
Dim isRunning
isRunning = False
On Error Resume Next
Dim objWMIService, colProcesses, objProcess
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set colProcesses = objWMIService.ExecQuery("Select CommandLine from Win32_Process Where Name = 'node.exe'")
For Each objProcess In colProcesses
    If Not IsNull(objProcess.CommandLine) Then
        If InStr(objProcess.CommandLine, "supervisor.js") > 0 Then
            isRunning = True
            Exit For
        End If
    End If
Next
On Error GoTo 0

If isRunning Then
    WScript.Quit 0
End If

Dim runTarget
If fso.FileExists(targetDir & "\supervisor.js") Then
    runTarget = "supervisor.js"
Else
    runTarget = "server.js"
End If

WshShell.CurrentDirectory = targetDir
Dim runCmd
runCmd = "cmd.exe /s /c ""set PATH=G:\Programas\nodejs;C:\Program Files\nodejs;%PATH% && " & nodeExe & " " & runTarget & " >> """ & targetDir & "\server_background.log"" 2>&1"""
WshShell.Run runCmd, 0, False

