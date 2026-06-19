# 播放提示音
[console]::beep(1000,500)
Start-Sleep -Milliseconds 200
[console]::beep(1200,500)

# 置顶弹窗，手动关闭才消失
Add-Type -AssemblyName PresentationFramework
$window = New-Object System.Windows.Window
$window.Title = "Codex Notification"
$window.Content = "Codex Tasks have completed successfully."
$window.Width = 350
$window.Height = 150
$window.Topmost = $true
$window.WindowStartupLocation = "Manual"
$window.Left = [System.Windows.SystemParameters]::PrimaryScreenWidth - 380
$window.Top = [System.Windows.SystemParameters]::PrimaryScreenHeight - 180
$window.ShowDialog()