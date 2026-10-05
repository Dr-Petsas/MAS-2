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
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }
    const uint WM_SETTEXT = 0x000C;
    const uint BM_CLICK = 0x00F5;
    const uint BM_SETCHECK = 0x00F1;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;

    static uint Pid()
    {
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) return (uint)p.Id;
        return 0;
    }

    static void ClickHwnd(IntPtr h)
    {
        RECT r;
        GetWindowRect(h, out r);
        SetCursorPos((r.L + r.R) / 2, (r.T + r.B) / 2);
        Thread.Sleep(60);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(40);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        SendMessage(h, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
    }

    static void Main()
    {
        var pid = Pid();
        IntPtr dlg = IntPtr.Zero, beschr = IntPtr.Zero, anmerk = IntPtr.Zero, aendern = IntPtr.Zero, akte = IntPtr.Zero;
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var title = new StringBuilder(256);
            GetWindowText(h, title, 256);
            var t = title.ToString();
            if (t.IndexOf("Leistung", StringComparison.OrdinalIgnoreCase) >= 0 &&
                (t.IndexOf("ndern", StringComparison.OrdinalIgnoreCase) >= 0 || t.IndexOf("hinzuf", StringComparison.OrdinalIgnoreCase) >= 0))
                dlg = h;
            return true;
        }, IntPtr.Zero);
        if (dlg == IntPtr.Zero) { Console.WriteLine("no leistung dialog"); return; }
        Console.WriteLine("dlg ok");
        SetForegroundWindow(dlg);
        EnumChildWindows(dlg, (c, x) =>
        {
            if (!IsWindowVisible(c)) return true;
            var cls = new StringBuilder(64);
            var title = new StringBuilder(256);
            GetClassName(c, cls, 64);
            GetWindowText(c, title, 256);
            RECT r;
            GetWindowRect(c, out r);
            var w = r.R - r.L; var h = r.B - r.T;
            var name = cls.ToString();
            var t = title.ToString();
            if (name == "Edit" && w > 500 && h > 60) anmerk = c;
            if (name == "Edit" && w > 300 && w < 450 && h >= 16 && h <= 26 && r.T > 430 && r.T < 490) beschr = c;
            if (t.IndexOf("ndern", StringComparison.OrdinalIgnoreCase) >= 0 && name == "Button" && w > 60) aendern = c;
            if (t.IndexOf("Hinzuf", StringComparison.OrdinalIgnoreCase) >= 0 && name == "Button") aendern = c;
            if (t.IndexOf("Patientenakte", StringComparison.OrdinalIgnoreCase) >= 0) akte = c;
            return true;
        }, IntPtr.Zero);

        Console.WriteLine("beschr=" + beschr.ToInt64().ToString("X") + " anmerk=" + anmerk.ToInt64().ToString("X") + " aendern=" + aendern.ToInt64().ToString("X"));
        if (beschr != IntPtr.Zero)
            SendMessage(beschr, WM_SETTEXT, IntPtr.Zero, "PICKADOC DOKU");
        if (anmerk != IntPtr.Zero)
            SendMessage(anmerk, WM_SETTEXT, IntPtr.Zero, "Implantation OP klein, 60 min. Anamnese Hepatitis B, Viread 245, Allergie Penicillin. Testdokumente: Anamnesebogen, CareCapital, Datenschutz, KI-Telefonie.");
        if (akte != IntPtr.Zero)
            SendMessage(akte, BM_SETCHECK, (IntPtr)1, IntPtr.Zero);
        Thread.Sleep(200);
        if (aendern != IntPtr.Zero)
        {
            ClickHwnd(aendern);
            Console.WriteLine("clicked Aendern/Hinzufuegen");
        }
        else Console.WriteLine("no confirm button");
    }
}
