using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    const uint BM_CLICK = 0x00F5;

    static void Main()
    {
        uint pid = 0;
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) pid = (uint)p.Id;
        int n = 0;
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var t = new StringBuilder(128);
            var c = new StringBuilder(64);
            GetWindowText(h, t, 128);
            GetClassName(h, c, 64);
            var title = t.ToString();
            var cls = c.ToString();
            bool dialog = cls == "#32770" || title == "Hinweis" || title == "DENSoffice" || title.IndexOf("Fehler") >= 0;
            if (!dialog) return true;
            EnumChildWindows(h, (ch, x) =>
            {
                var ct = new StringBuilder(64);
                GetWindowText(ch, ct, 64);
                var s = ct.ToString();
                if (s == "OK" || s == "&OK" || s == "Ok")
                {
                    SetForegroundWindow(h);
                    SendMessage(ch, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
                    Console.WriteLine("clicked OK on [" + title + "]");
                    n++;
                }
                return true;
            }, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
        Console.WriteLine("done n=" + n);
    }
}
