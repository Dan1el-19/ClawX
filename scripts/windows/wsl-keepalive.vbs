Option Explicit

Dim shell, distro, linuxUser, command, exitCode

If WScript.Arguments.Count < 1 Then
  WScript.Quit 2
End If

Set shell = CreateObject("WScript.Shell")
distro = WScript.Arguments(0)
linuxUser = ""

If WScript.Arguments.Count >= 2 Then
  linuxUser = WScript.Arguments(1)
End If

command = "wsl.exe -d " & Quote(distro)
If Len(linuxUser) > 0 Then
  command = command & " --user " & Quote(linuxUser)
End If
command = command & " --exec /bin/sleep infinity"

Do
  exitCode = shell.Run(command, 0, True)
  WScript.Sleep 2000
Loop

Function Quote(value)
  Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
