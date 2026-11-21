# เปิด Mobile hotspot ของ Windows (ให้บอร์ดต่อเข้ามาส่งไฟล์)
# ใช้ API ของ Windows ตัวเดียวกับปุ่มใน Settings > Mobile hotspot
# ชื่อ/รหัส/Band (ต้องเป็น 2.4 GHz) ตั้งใน Settings ครั้งเดียว สคริปต์นี้แค่สั่งเปิด

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

# API ของ Windows แบบนี้เป็น async ต้องรอผลก่อนไปบรรทัดต่อไป
function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

$profile = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]::GetInternetConnectionProfile()
if ($null -eq $profile) {
    Write-Output "hotspot: คอมยังไม่ได้ต่อเน็ต เปิด hotspot ไม่ได้ (ต่อ Wi-Fi/สาย LAN ก่อน)"
    exit 1
}
$tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::CreateFromConnectionProfile($profile)
$cfg = $tm.GetCurrentAccessPointConfiguration()

# ESP32 ต่อได้แค่ 2.4 GHz ถ้าตั้งเป็น Auto/5 GHz อยู่ ให้เปลี่ยน (ตั้งครั้งเดียว Windows จำไว้)
if ($cfg.Band -ne 'TwoPointFourGigahertz') {
    $cfg.Band = 'TwoPointFourGigahertz'
    # คำสั่งนี้ไม่คืนค่า (IAsyncAction) จึงใช้ AsTask อีกแบบรอให้เสร็จ
    $asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
    $asTaskAction.Invoke($null, @($tm.ConfigureAccessPointAsync($cfg))).Wait(-1) | Out-Null
    Write-Output "hotspot: ตั้ง Band เป็น 2.4 GHz แล้ว"
}

if ($tm.TetheringOperationalState -eq 'On') {
    Write-Output "hotspot: เปิดอยู่แล้ว ($($cfg.Ssid))"
    exit 0
}
$result = Await ($tm.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
if ($result.Status -eq 'Success') {
    Write-Output "hotspot: เปิดแล้ว ($($cfg.Ssid))"
} else {
    Write-Output "hotspot: เปิดไม่สำเร็จ ($($result.Status)) ลองเปิดเองใน Settings > Mobile hotspot"
}
