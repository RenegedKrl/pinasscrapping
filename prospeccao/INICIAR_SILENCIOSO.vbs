Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

If fso.FileExists(currentDir & "\server.js") Then
    WshShell.CurrentDirectory = currentDir
    WshShell.Run "cmd /c node server.js", 0, False
ElseIf fso.FileExists(currentDir & "\prospeccao\server.js") Then
    WshShell.CurrentDirectory = currentDir & "\prospeccao"
    WshShell.Run "cmd /c node server.js", 0, False
End If
