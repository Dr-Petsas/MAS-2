using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class Program
{
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }
    const uint BM_CLICK = 0x00F5;
    const uint MOUSEEVENTF_LEFTDOWN = 2;
    const uint MOUSEEVENTF_LEFTUP = 4;

    static void Main(string[] args)
    {
        var p = Process.GetProcessesByName("DENSimport");
        if (p.Length == 0) { Console.WriteLine("no import"); return; }
        var hwnd = p[0].MainWindowHandle;
        ShowWindow(hwnd, 9);
        SetForegroundWindow(hwnd);
        Thread.Sleep(300);
        if (args.Length > 0 && args[0] == "dump")
        {
            EnumChildWindows(hwnd, (c, x) =>
            {
                var cls = new StringBuilder(64);
                var t = new StringBuilder(256);
                GetClassName(c, cls, 64);
                GetWindowText(c, t, 256);
                RECT r; GetWindowRect(c, out r);
                Console.WriteLine(cls + " \"" + t + "\" " + (r.R-r.L) + "x" + (r.B-r.T) + " @" + r.L + "," + r.T);
                return true;
            }, IntPtr.Zero);
            return;
        }
        IntPtr btn = IntPtr.Zero; RECT br = new RECT();
        var want = args.Length > 0 ? args[0] : "Einstellungen";
        EnumChildWindows(hwnd, (c, x) =>
        {
            var t = new StringBuilder(256);
            GetWindowText(c, t, 256);
            if (t.ToString().IndexOf(want, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                btn = c; GetWindowRect(c, out br);
            }
            return true;
        }, IntPtr.Zero);
        if (btn == IntPtr.Zero) { Console.WriteLine("no button " + want); return; }
        int x = (br.L + br.R) / 2, y = (br.T + br.B) / 2;
        SetCursorPos(x, y);
        Thread.Sleep(80);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(40);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        SendMessage(btn, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
        Console.WriteLine("clicked " + want);
    }
}
