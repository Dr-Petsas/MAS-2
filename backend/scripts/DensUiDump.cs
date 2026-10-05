using System;
using System.Diagnostics;
using System.IO;
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
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }

    static void Main()
    {
        var pid = 0;
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) pid = p.Id;
        var sb = new StringBuilder();
        sb.AppendLine("PID=" + pid);
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != (uint)pid) return true;
            if (!IsWindowVisible(h)) return true;
            Dump(h, 0, sb);
            EnumChildWindows(h, (c, x) => { if (IsWindowVisible(c)) Dump(c, 1, sb); return true; }, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
        var path = @"F:\MAS-2\backend\scripts\dens-ui-dump.txt";
        File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
        Console.WriteLine(path);
        Console.WriteLine(sb.Length);
    }

    static void Dump(IntPtr h, int depth, StringBuilder sb)
    {
        var title = new StringBuilder(256);
        var cls = new StringBuilder(256);
        GetWindowText(h, title, title.Capacity);
        GetClassName(h, cls, cls.Capacity);
        RECT r;
        GetWindowRect(h, out r);
        var w = r.R - r.L; var ht = r.B - r.T;
        if (w < 20 || ht < 10) return;
        sb.Append(' ', depth * 2);
        sb.Append(cls + " \"" + title + "\" " + w + "x" + ht + " @" + r.L + "," + r.T);
        sb.AppendLine();
    }
}
