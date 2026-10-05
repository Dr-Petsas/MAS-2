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
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    [DllImport("user32.dll")] static extern bool SetFocus(IntPtr h);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }
    const uint WM_SETTEXT = 0x000C;
    const int SW_MAXIMIZE = 3;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;

    static IntPtr leistung, uebernehmen, main, leistungLabel;
    static RECT ueberRect, labelRect;

    static uint Pid()
    {
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) return (uint)p.Id;
        return 0;
    }

    static void Main(string[] args)
    {
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero)
            {
                ShowWindow(p.MainWindowHandle, SW_MAXIMIZE);
                SetForegroundWindow(p.MainWindowHandle);
            }
        Thread.Sleep(500);

        var pid = Pid();
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var title = new StringBuilder(256);
            GetWindowText(h, title, 256);
            if (title.ToString().IndexOf("Behandlungsdaten", StringComparison.OrdinalIgnoreCase) >= 0)
                main = h;
            Walk(h);
            return true;
        }, IntPtr.Zero);

        Console.WriteLine("leistung=" + leistung.ToInt64().ToString("X") + " ueber=" + uebernehmen.ToInt64().ToString("X"));
        if (leistung == IntPtr.Zero) { Console.WriteLine("no leistung field"); return; }
        if (main != IntPtr.Zero) SetForegroundWindow(main);
        SetFocus(leistung);

        var text = args.Length > 0 ? string.Join(" ", args)
            : "notiz PICKADOC DOKU: Implantation OP klein, 60 min. Anamnese Hepatitis B, Viread 245, Allergie Penicillin.";
        SendMessage(leistung, WM_SETTEXT, IntPtr.Zero, text);
        Thread.Sleep(250);
        Console.WriteLine("set [" + text + "]");

        if (uebernehmen == IntPtr.Zero) { Console.WriteLine("no uebernehmen"); return; }
        int x = (ueberRect.L + ueberRect.R) / 2;
        int y = (ueberRect.T + ueberRect.B) / 2;
        SetCursorPos(x, y);
        Thread.Sleep(80);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(50);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        Console.WriteLine("clicked Uebernehmen @" + x + "," + y);
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
            if (t.IndexOf("Leistung", StringComparison.OrdinalIgnoreCase) >= 0 && cls.ToString() == "Static")
            {
                leistungLabel = c;
                labelRect = r;
            }
            if (cls.ToString() == "Edit" && w > 400 && h >= 24 && h <= 50 && leistungLabel != IntPtr.Zero)
            {
                if (r.L >= labelRect.L - 20 && Math.Abs(r.T - labelRect.T) < 80)
                    leistung = c;
            }
            if (t.IndexOf("bernehmen", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                uebernehmen = c;
                ueberRect = r;
            }
            return true;
        }, IntPtr.Zero);
    }
}
