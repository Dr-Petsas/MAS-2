using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class Program
{
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }
    const uint WM_SETTEXT = 0x000C;
    const uint BM_CLICK = 0x00F5;
    const uint WM_LBUTTONDOWN = 0x0201;
    const uint WM_LBUTTONUP = 0x0202;

    static IntPtr leistung, uebernehmen, zahn, main;

    static uint Pid()
    {
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) return (uint)p.Id;
        return 0;
    }

    static void Main()
    {
        var pid = Pid();
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var title = new StringBuilder(256);
            GetWindowText(h, title, 256);
            if (title.ToString().IndexOf("DENSoffice", StringComparison.OrdinalIgnoreCase) >= 0)
                main = h;
            Walk(h);
            return true;
        }, IntPtr.Zero);

        Console.WriteLine("leistung=" + leistung.ToInt64().ToString("X") + " ueber=" + uebernehmen.ToInt64().ToString("X") + " zahn=" + zahn.ToInt64().ToString("X"));
        if (main != IntPtr.Zero) SetForegroundWindow(main);
        Thread.Sleep(200);
        if (leistung == IntPtr.Zero) { Console.WriteLine("no leistung field"); return; }

        var text = "PICKADOC DOKU: Implantation OP klein, 60 min. Anamnese Hepatitis B, Viread 245, Allergie Penicillin. Testdokumente: Anamnesebogen, CareCapital, Datenschutz, KI-Telefonie.";
        SendMessage(leistung, WM_SETTEXT, IntPtr.Zero, text);
        Thread.Sleep(200);
        if (uebernehmen != IntPtr.Zero)
        {
            SetForegroundWindow(uebernehmen);
            SendMessage(uebernehmen, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
            PostMessage(uebernehmen, WM_LBUTTONDOWN, (IntPtr)1, IntPtr.Zero);
            PostMessage(uebernehmen, WM_LBUTTONUP, IntPtr.Zero, IntPtr.Zero);
            Console.WriteLine("clicked Uebernehmen");
        }
    }

    static void Walk(IntPtr root)
    {
        EnumChildWindows(root, (c, x) =>
        {
            if (!IsWindowVisible(c)) return true;
            var cls = new StringBuilder(64);
            var title = new StringBuilder(256);
            GetClassName(c, cls, 64);
            GetWindowText(c, title, 256);
            RECT r;
            GetWindowRect(c, out r);
            var w = r.R - r.L; var h = r.B - r.T;
            var t = title.ToString();
            if (cls.ToString() == "Edit" && w > 800 && h >= 28 && h <= 50 && r.T > 800)
                leistung = c;
            if (t.IndexOf("bernehmen", StringComparison.OrdinalIgnoreCase) >= 0)
                uebernehmen = c;
            if (cls.ToString() == "Edit" && w > 100 && w < 160 && h >= 28 && h <= 50 && r.T > 800 && r.L < 80)
                zahn = c;
            return true;
        }, IntPtr.Zero);
    }
}
