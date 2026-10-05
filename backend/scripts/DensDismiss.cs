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
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }
    const uint BM_CLICK = 0x00F5;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;

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
            var cls = new StringBuilder(64);
            var title = new StringBuilder(128);
            GetClassName(h, cls, 64);
            GetWindowText(h, title, 128);
            var c = cls.ToString();
            var t = title.ToString();
            bool dlg = c == "#32770" || t == "Hinweis" || t == "DENSoffice";
            if (!dlg) return true;
            RECT r;
            GetWindowRect(h, out r);
            int w = r.R - r.L, ht = r.B - r.T;
            if (w > 900 || ht > 400) return true;
            Console.WriteLine("dlg " + t + " " + w + "x" + ht);
            EnumChildWindows(h, (ch, x) =>
            {
                var ct = new StringBuilder(32);
                GetWindowText(ch, ct, 32);
                if (ct.ToString().IndexOf("OK") >= 0)
                {
                    SetForegroundWindow(h);
                    SendMessage(ch, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
                    RECT br;
                    GetWindowRect(ch, out br);
                    SetCursorPos((br.L + br.R) / 2, (br.T + br.B) / 2);
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                    n++;
                    Console.WriteLine("clicked OK");
                }
                return true;
            }, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
        Console.WriteLine("dismissed=" + n);
    }
}
