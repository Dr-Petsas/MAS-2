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
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, StringBuilder l);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }
    const uint WM_SETTEXT = 0x000C;
    const uint WM_GETTEXT = 0x000D;
    const uint WM_GETTEXTLENGTH = 0x000E;
    const uint BM_CLICK = 0x00F5;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;

    static string GetText(IntPtr h)
    {
        int n = (int)SendMessage(h, WM_GETTEXTLENGTH, IntPtr.Zero, IntPtr.Zero);
        if (n <= 0) return "";
        var sb = new StringBuilder(n + 1);
        SendMessage(h, WM_GETTEXT, (IntPtr)(n + 1), sb);
        return sb.ToString();
    }

    static void Main()
    {
        uint pid = 0;
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) pid = (uint)p.Id;

        IntPtr dlg = IntPtr.Zero;
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var t = new StringBuilder(256);
            GetWindowText(h, t, 256);
            if (t.ToString().IndexOf("Leistung", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                dlg = h;
                Console.WriteLine("dlg [" + t + "]");
            }
            return true;
        }, IntPtr.Zero);
        if (dlg == IntPtr.Zero) { Console.WriteLine("no dialog"); return; }

        IntPtr beschreibung = IntPtr.Zero, anmerkungen = IntPtr.Zero, aendern = IntPtr.Zero;
        RECT aendernRect = new RECT();
        EnumChildWindows(dlg, (c, x) =>
        {
            var cls = new StringBuilder(64);
            var title = new StringBuilder(256);
            GetClassName(c, cls, 64);
            GetWindowText(c, title, 256);
            RECT r;
            GetWindowRect(c, out r);
            int w = r.R - r.L, h = r.B - r.T;
            string name = cls.ToString();
            string t = title.ToString();
            Console.WriteLine("  " + name + " \"" + t + "\" " + w + "x" + h + " @" + r.L + "," + r.T + " txt=[" + (name == "Edit" ? GetText(c) : "") + "]");
            if (name == "Edit" && h >= 18 && h <= 32 && w > 200) beschreibung = c;
            if (name == "Edit" && h > 40 && w > 200) anmerkungen = c;
            if (t.IndexOf("ndern", StringComparison.OrdinalIgnoreCase) >= 0 && name == "Button")
            {
                aendern = c;
                aendernRect = r;
            }
            return true;
        }, IntPtr.Zero);

        var kurz = "PICKADOC DOKU Implantation OP klein 60 min";
        var lang = "PICKADOC DOKU: Implantation OP klein, 60 min. Anamnese Hepatitis B, Viread 245, Allergie Penicillin. Testdokumente: Anamnesebogen, CareCapital, Datenschutz, KI-Telefonie.";
        SetForegroundWindow(dlg);
        if (beschreibung != IntPtr.Zero)
        {
            SendMessage(beschreibung, WM_SETTEXT, IntPtr.Zero, kurz);
            Console.WriteLine("beschreibung set");
        }
        if (anmerkungen != IntPtr.Zero)
        {
            SendMessage(anmerkungen, WM_SETTEXT, IntPtr.Zero, lang);
            Console.WriteLine("anmerkungen set");
        }
        Thread.Sleep(200);
        if (aendern != IntPtr.Zero)
        {
            int x = (aendernRect.L + aendernRect.R) / 2;
            int y = (aendernRect.T + aendernRect.B) / 2;
            SetCursorPos(x, y);
            Thread.Sleep(80);
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(40);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            SendMessage(aendern, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
            Console.WriteLine("clicked Aendern @" + x + "," + y);
        }
        else Console.WriteLine("no Aendern button");
    }
}
