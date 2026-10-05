using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern int SendMessage(IntPtr h, uint m, IntPtr w, StringBuilder l);
    [DllImport("user32.dll")] static extern int SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }
    const uint WM_GETTEXT = 0x000D;
    const uint WM_GETTEXTLENGTH = 0x000E;
    const uint LB_GETCOUNT = 0x018B;
    const uint LB_GETTEXT = 0x0189;
    const uint LB_GETTEXTLEN = 0x018A;

    static uint Pid()
    {
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) return (uint)p.Id;
        return 0;
    }

    static string GetText(IntPtr h)
    {
        int n = SendMessage(h, WM_GETTEXTLENGTH, IntPtr.Zero, IntPtr.Zero);
        if (n <= 0) return "";
        var sb = new StringBuilder(n + 1);
        SendMessage(h, WM_GETTEXT, (IntPtr)(n + 1), sb);
        return sb.ToString();
    }

    static void Main()
    {
        var pid = Pid();
        Console.WriteLine("pid=" + pid);
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var title = new StringBuilder(256);
            GetWindowText(h, title, 256);
            var t = title.ToString();
            if (t.Length > 0) Console.WriteLine("WIN " + t);
            Walk(h);
            return true;
        }, IntPtr.Zero);
    }

    static void Walk(IntPtr root)
    {
        EnumChildWindows(root, (c, x) =>
        {
            if (!IsWindowVisible(c)) return true;
            var cls = new StringBuilder(64);
            GetClassName(c, cls, 64);
            RECT r;
            GetWindowRect(c, out r);
            var w = r.R - r.L; var h = r.B - r.T;
            var name = cls.ToString();
            if (name == "Edit" && w > 800 && h >= 28 && h <= 50 && r.T > 800)
                Console.WriteLine("LEISTUNG=[" + GetText(c) + "]");
            if (name == "ListBox" && w > 800 && h > 200)
            {
                int n = SendMessage(c, LB_GETCOUNT, IntPtr.Zero, IntPtr.Zero);
                Console.WriteLine("LISTBOX count=" + n + " " + w + "x" + h + " @" + r.L + "," + r.T);
                int max = n > 30 ? 30 : n;
                for (int i = 0; i < max; i++)
                {
                    int len = SendMessage(c, LB_GETTEXTLEN, (IntPtr)i, IntPtr.Zero);
                    var sb = new StringBuilder(len + 1);
                    SendMessage(c, LB_GETTEXT, (IntPtr)i, sb);
                    Console.WriteLine("  [" + i + "] " + sb);
                }
            }
            return true;
        }, IntPtr.Zero);
    }
}
