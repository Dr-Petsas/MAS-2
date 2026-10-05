using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class Program
{
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }
    const uint BM_CLICK = 0x00F5;

    static void Main(string[] args)
    {
        string needle = args.Length > 0 ? args[0] : "Risiko";
        string btn = args.Length > 1 ? args[1] : "Schlie";
        uint pid = 0;
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) pid = (uint)p.Id;
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var t = new StringBuilder(128);
            GetWindowText(h, t, 128);
            if (t.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) < 0) return true;
            Console.WriteLine("found " + t);
            SetForegroundWindow(h);
            EnumChildWindows(h, (c, x) =>
            {
                var ct = new StringBuilder(64);
                GetWindowText(c, ct, 64);
                if (ct.ToString().IndexOf(btn, StringComparison.OrdinalIgnoreCase) < 0) return true;
                RECT r;
                GetWindowRect(c, out r);
                SetCursorPos((r.L + r.R) / 2, (r.T + r.B) / 2);
                Thread.Sleep(50);
                mouse_event(2, 0, 0, 0, UIntPtr.Zero);
                mouse_event(4, 0, 0, 0, UIntPtr.Zero);
                SendMessage(c, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
                Console.WriteLine("clicked " + ct);
                return true;
            }, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
    }
}
