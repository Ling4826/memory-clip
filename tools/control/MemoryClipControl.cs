// Memory Clip Control: หน้าต่างเปิด/ปิด server ของ Memory Clip จาก Desktop
// คอมไพล์ด้วย csc ของ .NET Framework ที่มากับ Windows (ดู build.bat) ไม่ต้องลงอะไรเพิ่ม
// csc ตัวนี้รองรับแค่ C# 5 จึงไม่ใช้ $"..." หรือ ?.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class ControlForm : Form
{
    const string ServerDir = @"D:\ADONO\Memory Clip\server";
    const string LocalUrl = "http://127.0.0.1:8000";
    const int Port = 8000;
    static readonly string LogFile = Path.Combine(ServerDir, "server_log.txt");
    long logPos;
    const string TailscaleExe = @"C:\Program Files\Tailscale\tailscale.exe";

    static readonly Color Bg = Color.FromArgb(17, 17, 17);
    static readonly Color Card = Color.FromArgb(28, 28, 30);
    static readonly Color Fg = Color.FromArgb(235, 235, 235);
    static readonly Color Muted = Color.FromArgb(150, 150, 155);
    static readonly Color Green = Color.FromArgb(52, 199, 89);
    static readonly Color Red = Color.FromArgb(255, 69, 58);
    static readonly Color Amber = Color.FromArgb(255, 179, 64);

    Button toggleBtn, webBtn;
    CheckBox hotspotChk, tailscaleChk;
    Label serverDot, serverText, deviceText, problemText;
    TextBox logBox;
    System.Windows.Forms.Timer poll;
    Process serverProc;          // server ที่หน้าต่างนี้เปิดเอง (null = ไม่ได้เปิดเอง)
    volatile bool serverUp;
    volatile bool busy;          // กำลังเปิด/ปิดอยู่ กันกดซ้ำ

    public ControlForm()
    {
        Text = "Memory Clip";
        ClientSize = new Size(460, 560);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Bg;
        ForeColor = Fg;
        Font = new Font("Leelawadee UI", 10f);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        Controls.Add(new Label { Text = "●", ForeColor = Red, Font = new Font("Segoe UI", 15f), AutoSize = true, Location = new Point(18, 15) });
        Controls.Add(new Label { Text = "Memory Clip", Font = new Font("Leelawadee UI", 15f, FontStyle.Bold), ForeColor = Fg, AutoSize = true, Location = new Point(44, 16) });
        var sub = new Label { Text = "เปิด/ปิด server และหน้าเว็บ", ForeColor = Muted, AutoSize = true, Location = new Point(23, 50) };
        Controls.Add(sub);

        // แถวสถานะ server
        var srvCard = MakeCard(20, 82, 420, 52);
        serverDot = new Label { Text = "●", ForeColor = Muted, Font = new Font("Segoe UI", 14f), AutoSize = true, Location = new Point(12, 11) };
        serverText = new Label { Text = "กำลังตรวจสอบ...", ForeColor = Fg, Font = new Font("Leelawadee UI", 11f, FontStyle.Bold), AutoSize = true, Location = new Point(38, 14) };
        srvCard.Controls.Add(serverDot); srvCard.Controls.Add(serverText);

        toggleBtn = MakeButton("เปิด Server", 20, 146, 205, 46, Green, Color.Black);
        toggleBtn.Click += (s, e) => { if (serverUp) StopServer(); else StartServer(); };
        webBtn = MakeButton("เปิดหน้าเว็บ", 235, 146, 205, 46, Card, Fg);
        webBtn.Click += (s, e) => OpenWeb();
        Controls.Add(toggleBtn); Controls.Add(webBtn);

        hotspotChk = new CheckBox { Text = "เปิด hotspot ให้กล้องส่งไฟล์", Checked = true, AutoSize = true, Location = new Point(22, 204), ForeColor = Fg };
        tailscaleChk = new CheckBox { Text = "เปิด Tailscale (ดูจากมือถือ)", Checked = File.Exists(TailscaleExe), Enabled = File.Exists(TailscaleExe), AutoSize = true, Location = new Point(22, 230), ForeColor = Fg };
        Controls.Add(hotspotChk); Controls.Add(tailscaleChk);

        // สถานะกล้อง (จาก /api/status)
        var devCard = MakeCard(20, 264, 420, 96);
        devCard.Controls.Add(new Label { Text = "กล้อง", ForeColor = Muted, AutoSize = true, Location = new Point(12, 8) });
        deviceText = new Label { Text = "-", ForeColor = Fg, AutoSize = false, Size = new Size(396, 44), Location = new Point(12, 28) };
        problemText = new Label { Text = "", ForeColor = Amber, AutoSize = false, Size = new Size(396, 22), Location = new Point(12, 70) };
        devCard.Controls.Add(deviceText); devCard.Controls.Add(problemText);

        Controls.Add(new Label { Text = "บันทึกการทำงาน", ForeColor = Muted, AutoSize = true, Location = new Point(22, 372) });
        logBox = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, BackColor = Card, ForeColor = Color.FromArgb(200, 200, 205), BorderStyle = BorderStyle.None, Font = new Font("Consolas", 8.5f), Location = new Point(20, 396), Size = new Size(420, 148) };
        Controls.Add(logBox);

        poll = new System.Windows.Forms.Timer { Interval = 4000 };
        poll.Tick += (s, e) => RefreshStatus();
        poll.Start();
        var tail = new System.Windows.Forms.Timer { Interval = 1000 };
        tail.Tick += (s, e) => TailLog();
        tail.Start();
        Shown += (s, e) => RefreshStatus();
        FormClosing += OnClosing;
    }

    Panel MakeCard(int x, int y, int w, int h)
    {
        var p = new Panel { Location = new Point(x, y), Size = new Size(w, h), BackColor = Card };
        Controls.Add(p);
        return p;
    }

    Button MakeButton(string text, int x, int y, int w, int h, Color back, Color fore)
    {
        var b = new Button { Text = text, Location = new Point(x, y), Size = new Size(w, h), BackColor = back, ForeColor = fore, FlatStyle = FlatStyle.Flat, Font = new Font("Leelawadee UI", 11f, FontStyle.Bold), Cursor = Cursors.Hand };
        b.FlatAppearance.BorderSize = 0;
        return b;
    }

    void Log(string line)
    {
        if (string.IsNullOrEmpty(line)) return;
        if (InvokeRequired) { BeginInvoke(new Action<string>(Log), line); return; }
        logBox.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  " + line + Environment.NewLine);
        if (logBox.TextLength > 60000) logBox.Text = logBox.Text.Substring(30000);
    }

    // ---------- สถานะ ----------
    void RefreshStatus()
    {
        ThreadPool.QueueUserWorkItem(_ =>
        {
            string json = HttpGet(LocalUrl + "/api/status", 2500);
            bool up = json != null || PortPids().Count > 0 && HttpGet(LocalUrl + "/api/time", 2500) != null;
            serverUp = up;
            try { BeginInvoke(new Action(() => ShowStatus(up, json))); } catch { }
        });
    }

    void ShowStatus(bool up, string json)
    {
        if (busy) return;
        serverDot.ForeColor = up ? Green : Red;
        serverText.Text = up ? "Server ทำงานอยู่  ·  " + LocalUrl : "Server ปิดอยู่";
        toggleBtn.Text = up ? "ปิด Server" : "เปิด Server";
        toggleBtn.BackColor = up ? Red : Green;
        toggleBtn.ForeColor = up ? Color.White : Color.Black;
        toggleBtn.Enabled = true;
        webBtn.Enabled = up;
        if (!up || json == null) { deviceText.Text = up ? "ยังไม่มีข้อมูลจากกล้อง" : "-"; problemText.Text = ""; return; }

        try
        {
            var d = (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(json);
            var parts = new List<string>();
            object v;
            if (d.TryGetValue("minutes", out v) && v != null) parts.Add("ส่งล่าสุด " + v + " นาทีที่แล้ว");
            if (d.TryGetValue("battery_percent", out v) && v != null) parts.Add("แบต " + v + "%");
            var st = d.ContainsKey("status") ? d["status"] as Dictionary<string, object> : null;
            if (st != null)
            {
                if (st.TryGetValue("rssi", out v)) parts.Add("สัญญาณ " + v + " dBm");
                if (st.TryGetValue("pending", out v)) parts.Add("ไฟล์รอส่ง " + v);
                if (st.TryGetValue("sd_ok", out v)) parts.Add(Equals(v, true) ? "SD ปกติ" : "SD มีปัญหา");
            }
            deviceText.Text = string.Join("  ·  ", parts.ToArray());
            var probs = d.ContainsKey("problems") ? d["problems"] as object[] : null;
            problemText.Text = probs != null && probs.Length > 0 ? "⚠ " + string.Join(" / ", Array.ConvertAll(probs, p => ProblemText(p))) : "";
        }
        catch (Exception ex) { deviceText.Text = "อ่านสถานะไม่ได้: " + ex.Message; }
    }

    static string ProblemText(object p)
    {
        var d = p as Dictionary<string, object>;
        if (d == null) return Convert.ToString(p);
        object v;
        if (d.TryGetValue("text", out v) || d.TryGetValue("message", out v)) return Convert.ToString(v);
        return new JavaScriptSerializer().Serialize(p);
    }

    static string HttpGet(string url, int timeoutMs)
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Timeout = timeoutMs; req.ReadWriteTimeout = timeoutMs; req.Proxy = null;
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                return sr.ReadToEnd();
        }
        catch { return null; }
    }

    // PID ของโปรแกรมที่จับพอร์ต 8000 อยู่ (ใช้ปิด server ได้ แม้จะเปิดจากที่อื่น เช่น start_server.bat)
    static List<int> PortPids()
    {
        var pids = new List<int>();
        string outp = RunCapture("netstat", "-ano -p TCP", 5000);
        if (outp == null) return pids;
        var rx = new Regex(@"^\s*TCP\s+\S+:" + Port + @"\s+\S+\s+LISTENING\s+(\d+)", RegexOptions.Multiline);
        foreach (Match m in rx.Matches(outp))
        {
            int pid = int.Parse(m.Groups[1].Value);
            if (pid > 0 && !pids.Contains(pid)) pids.Add(pid);
        }
        return pids;
    }

    static string RunCapture(string exe, string args, int timeoutMs)
    {
        try
        {
            var psi = new ProcessStartInfo(exe, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8 };
            using (var p = Process.Start(psi))
            {
                string o = p.StandardOutput.ReadToEnd();
                p.WaitForExit(timeoutMs);
                return o;
            }
        }
        catch { return null; }
    }

    // อ่านบรรทัดใหม่ใน server_log.txt มาแสดง
    void TailLog()
    {
        if (serverProc == null) return;
        try
        {
            using (var fs = new FileStream(LogFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                if (fs.Length < logPos) logPos = 0;
                if (fs.Length == logPos) return;
                fs.Seek(logPos, SeekOrigin.Begin);
                var buf = new byte[Math.Min(fs.Length - logPos, 65536)];
                int n = fs.Read(buf, 0, buf.Length);
                int cut = Array.LastIndexOf(buf, (byte)10, n - 1);
                if (cut < 0) return;
                logPos += cut + 1;
                foreach (var l in Encoding.UTF8.GetString(buf, 0, cut).Split('\n'))
                    if (!IsPollLine(l)) Log(l.TrimEnd('\r'));
            }
        }
        catch { }
    }

    // คำขอที่หน้าต่างนี้ถามสถานะเองทุก 4 วินาที ไม่ต้องแสดง
    static bool IsPollLine(string l)
    {
        return l.StartsWith("127.0.0.1") && (l.Contains("GET /api/status ") || l.Contains("GET /api/time "));
    }

    // ---------- เปิด / ปิด ----------
    void SetBusy(string text)
    {
        busy = true;
        toggleBtn.Enabled = false;
        toggleBtn.Text = text;
        toggleBtn.BackColor = Card;
        toggleBtn.ForeColor = Muted;
    }

    void StartServer()
    {
        SetBusy("กำลังเปิด...");
        bool doHotspot = hotspotChk.Checked, doTs = tailscaleChk.Checked;
        ThreadPool.QueueUserWorkItem(_ =>
        {
            if (doHotspot)
            {
                Log("เปิด hotspot...");
                string o = RunCapture("powershell", "-NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(ServerDir, "hotspot_on.ps1") + "\"", 30000);
                foreach (var l in (o ?? "hotspot: เรียกสคริปต์ไม่ได้").Split('\n')) Log(l.Trim());
            }
            if (doTs)
            {
                RunCapture(TailscaleExe, "serve --bg --https=8443 http://127.0.0.1:" + Port, 15000);
                Log("Tailscale: เปิดแล้ว (มือถือในเครือข่าย Tailscale ดูได้)");
            }
            if (PortPids().Count > 0) { Log("server เปิดอยู่แล้ว"); Done(); return; }

            try
            {
                // ส่ง output ของ server ลงไฟล์ (ไม่ใช้ pipe) ปิดหน้าต่างนี้แล้ว server ยังรันต่อได้โดยไม่ค้าง
                string cmd = "/c \"\"" + PythonExe() + "\" server.py > \"" + LogFile + "\" 2>&1\"";
                var psi = new ProcessStartInfo("cmd.exe", cmd) { WorkingDirectory = ServerDir, UseShellExecute = false, CreateNoWindow = true };
                psi.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
                psi.EnvironmentVariables["PYTHONUNBUFFERED"] = "1";
                logPos = 0;
                serverProc = Process.Start(psi);
                Log("เริ่ม server.py (log: server_log.txt)");
            }
            catch (Exception ex) { Log("เปิด server ไม่ได้: " + ex.Message); Done(); return; }

            for (int i = 0; i < 40; i++)   // รอให้ตอบได้ ไม่เกิน ~20 วินาที
            {
                if (HttpGet(LocalUrl + "/api/time", 1000) != null) { Log("server พร้อมใช้งาน"); break; }
                Thread.Sleep(500);
            }
            Done();
        });
    }

    void StopServer()
    {
        SetBusy("กำลังปิด...");
        bool doTs = tailscaleChk.Enabled;
        ThreadPool.QueueUserWorkItem(_ =>
        {
            var pids = PortPids();
            if (serverProc != null && !serverProc.HasExited && !pids.Contains(serverProc.Id)) pids.Add(serverProc.Id);
            foreach (int pid in pids)
            {
                RunCapture("taskkill", "/PID " + pid + " /T /F", 10000);
                Log("ปิด server (PID " + pid + ")");
            }
            serverProc = null;
            if (doTs) { RunCapture(TailscaleExe, "serve --https=8443 off", 15000); Log("Tailscale: ปิดการแชร์หน้าเว็บแล้ว"); }
            Log("hotspot ยังเปิดอยู่ (ปิดได้ที่ Settings > Mobile hotspot)");
            Done();
        });
    }


    void Done()
    {
        busy = false;
        RefreshStatusSafe();
    }

    void RefreshStatusSafe()
    {
        try { BeginInvoke(new Action(RefreshStatus)); } catch { }
    }

    static string PythonExe()
    {
        string local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Python\Python311\python.exe");
        return File.Exists(local) ? local : "python";
    }

    void OpenWeb()
    {
        // เปิด Edge แบบหน้าต่างแอป (ไม่มีแถบที่อยู่) ถ้าไม่มี Edge ใช้เบราว์เซอร์หลัก
        string[] edges = { @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", @"C:\Program Files\Microsoft\Edge\Application\msedge.exe" };
        foreach (var e in edges)
            if (File.Exists(e)) { Process.Start(e, "--app=" + LocalUrl + " --window-size=1100,800"); return; }
        Process.Start(LocalUrl);
    }

    void OnClosing(object sender, FormClosingEventArgs e)
    {
        if (!serverUp || busy) return;
        var r = MessageBox.Show(this, "ปิด server ด้วยไหม?\n\nใช่ = ปิด server แล้วออก\nไม่ = ปล่อย server ทำงานต่อ (กล้องยังส่งไฟล์ได้)", "Memory Clip", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
        if (r == DialogResult.Cancel) { e.Cancel = true; return; }
        if (r == DialogResult.Yes)
        {
            foreach (int pid in PortPids()) RunCapture("taskkill", "/PID " + pid + " /T /F", 10000);
            if (tailscaleChk.Enabled) RunCapture(TailscaleExe, "serve --https=8443 off", 15000);
        }
    }

    [STAThread]
    static void Main()
    {
        bool created;
        using (var mutex = new Mutex(true, "MemoryClipControl", out created))
        {
            if (!created) { MessageBox.Show("Memory Clip เปิดอยู่แล้ว", "Memory Clip"); return; }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ControlForm());
        }
    }
}
