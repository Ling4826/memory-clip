@echo off
rem Build Memory Clip Control with the csc that ships with Windows, then copy it to the Desktop
cd /d "%~dp0"
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /codepage:65001 /win32icon:icon.ico /r:System.Web.Extensions.dll /out:"Memory Clip.exe" MemoryClipControl.cs
if errorlevel 1 exit /b 1
copy /y "Memory Clip.exe" "%USERPROFILE%\Desktop\Memory Clip.exe" >nul
echo built
