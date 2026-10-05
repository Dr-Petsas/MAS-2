// Schreibt eine Notiz in die offene DENS-Kartei — gleicher Weg wie der
// manuelle Test: Kettenerfassung "notiz" -> Uebernehmen -> Dialog -> Aendern.
// Kein Bank-Zugriff. Aufruf: DensUiDeliver.exe --kurz "..." --text "..."
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
    [DllImport("user32.dll")] static extern bool SetFocus(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, StringBuilder l);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr extra);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }

    const uint WM_SETTEXT = 0x000C;
    const uint WM_GETTEXT = 0x000D;
    const uint WM_GETTEXTLENGTH = 0x000E;
    const uint BM_CLICK = 0x00F5;
    const int SW_MAXIMIZE = 3;
    const uint MOUSEEVENTF_LEFTDOWN = 2;
    const uint MOUSEEVENTF_LEFTUP = 4;
    const uint KEYEVENTF_KEYUP = 2;
    const byte VK_F2 = 0x71;
    const byte VK_F8 = 0x77;
    const uint LVM_GETITEMCOUNT = 0x1004;

    static uint Pid()
    {
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) return (uint)p.Id;
        return 0;
    }

    static string GetText(IntPtr h)
    {
        int n = (int)SendMessage(h, WM_GETTEXTLENGTH, IntPtr.Zero, IntPtr.Zero);
        if (n <= 0) return "";
        var sb = new StringBuilder(n + 1);
        SendMessage(h, WM_GETTEXT, (IntPtr)(n + 1), sb);
        return sb.ToString();
    }

    static void ClickRect(RECT r)
    {
        int x = (r.L + r.R) / 2, y = (r.T + r.B) / 2;
        SetCursorPos(x, y);
        Thread.Sleep(80);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(40);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        Console.WriteLine("click @" + x + "," + y);
    }

    static void SendVk(IntPtr hwnd, byte vk)
    {
        if (hwnd != IntPtr.Zero) SetForegroundWindow(hwnd);
        Thread.Sleep(200);
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        Thread.Sleep(50);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Thread.Sleep(400);
    }

    static void SendF8(IntPtr hwnd) { SendVk(hwnd, VK_F8); }

    static IntPtr FindSearchDlg(uint pid)
    {
        IntPtr dlg = IntPtr.Zero;
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var t = new StringBuilder(256);
            GetWindowText(h, t, 256);
            if (t.ToString().IndexOf("Patient suchen", StringComparison.OrdinalIgnoreCase) >= 0)
                dlg = h;
            return true;
        }, IntPtr.Zero);
        return dlg;
    }

    static void OpenPatient(uint pid, IntPtr main, string pat, string name)
    {
        string q = (pat ?? "").Trim();
        if (q == "") q = (name ?? "").Trim();
        if (q == "") return;

        IntPtr dlg = FindSearchDlg(pid);
        if (dlg == IntPtr.Zero)
        {
            SendVk(main, VK_F2);
            for (int n = 0; n < 12 && dlg == IntPtr.Zero; n++)
            {
                dlg = FindSearchDlg(pid);
                if (dlg == IntPtr.Zero) Thread.Sleep(200);
            }
        }
        if (dlg == IntPtr.Zero)
        {
            Console.WriteLine("no search dialog");
            Environment.Exit(1);
        }

        IntPtr edit = IntPtr.Zero, suchen = IntPtr.Zero, ok = IntPtr.Zero, list = IntPtr.Zero;
        RECT suchenRect = new RECT(), okRect = new RECT();
        EnumChildWindows(dlg, (c, x) =>
        {
            var cls = new StringBuilder(64);
            var title = new StringBuilder(256);
            GetClassName(c, cls, 64);
            GetWindowText(c, title, 256);
            RECT r;
            GetWindowRect(c, out r);
            int w = r.R - r.L, ht = r.B - r.T;
            string cn = cls.ToString();
            string t = title.ToString().Replace("&", "");
            if (cn == "Edit" && w > 400 && ht >= 20 && ht <= 40) edit = c;
            if (cn == "SysListView32") list = c;
            if (cn == "Button" && t.IndexOf("Patient Suchen", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                suchen = c;
                suchenRect = r;
            }
            if (cn == "Button" && (t == "OK" || t == "Ok"))
            {
                ok = c;
                okRect = r;
            }
            return true;
        }, IntPtr.Zero);

        Console.WriteLine("search q=[" + q + "] edit=" + edit.ToInt64().ToString("X")
            + " suchen=" + suchen.ToInt64().ToString("X") + " ok=" + ok.ToInt64().ToString("X"));
        if (edit == IntPtr.Zero || suchen == IntPtr.Zero || ok == IntPtr.Zero)
        {
            Console.WriteLine("search dialog incomplete");
            Environment.Exit(1);
        }

        SetForegroundWindow(dlg);
        SetFocus(edit);
        SendMessage(edit, WM_SETTEXT, IntPtr.Zero, q);
        Thread.Sleep(150);
        ClickRect(suchenRect);
        SendMessage(suchen, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
        Thread.Sleep(700);

        int count = 0;
        if (list != IntPtr.Zero)
            count = (int)SendMessage(list, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero);
        Console.WriteLine("search hits=" + count);
        if (count <= 0)
        {
            Console.WriteLine("patient not found: " + q);
            Environment.Exit(1);
        }

        SetForegroundWindow(dlg);
        ClickRect(okRect);
        SendMessage(ok, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
        for (int n = 0; n < 15 && FindSearchDlg(pid) != IntPtr.Zero; n++)
            Thread.Sleep(200);
        Thread.Sleep(300);
        DismissOk(pid);
        Console.WriteLine("patient opened");
    }

    static void FindKette(uint pid, ref IntPtr leistung, ref IntPtr ueber, ref RECT ueberRect)
    {
        IntPtr label = IntPtr.Zero;
        RECT labelRect = new RECT();
        IntPtr foundL = IntPtr.Zero, foundU = IntPtr.Zero;
        RECT foundR = new RECT();
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            EnumChildWindows(h, (c, x) =>
            {
                if (!IsWindowVisible(c)) return true;
                var cls = new StringBuilder(64);
                var title = new StringBuilder(256);
                GetClassName(c, cls, 64);
                GetWindowText(c, title, 256);
                RECT r;
                GetWindowRect(c, out r);
                int w = r.R - r.L, ht = r.B - r.T;
                var t = title.ToString();
                if (t.IndexOf("Leistung", StringComparison.OrdinalIgnoreCase) >= 0 && cls.ToString() == "Static")
                {
                    label = c;
                    labelRect = r;
                }
                if (cls.ToString() == "Edit" && w > 400 && ht >= 24 && ht <= 50 && label != IntPtr.Zero)
                {
                    if (r.L >= labelRect.L - 20 && Math.Abs(r.T - labelRect.T) < 80)
                        foundL = c;
                }
                if (t.IndexOf("bernehmen", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    foundU = c;
                    foundR = r;
                }
                return true;
            }, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
        leistung = foundL;
        ueber = foundU;
        ueberRect = foundR;
    }

    static void DismissOk(uint pid)
    {
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var t = new StringBuilder(128);
            GetWindowText(h, t, 128);
            var title = t.ToString();
            bool close = title.IndexOf("Risiko", StringComparison.OrdinalIgnoreCase) >= 0
                || title == "Hinweis" || title.IndexOf("Fehler") >= 0;
            if (!close) return true;
            EnumChildWindows(h, (c, x) =>
            {
                var ct = new StringBuilder(64);
                GetWindowText(c, ct, 64);
                var s = ct.ToString();
                if (s.IndexOf("Schlie", StringComparison.OrdinalIgnoreCase) >= 0
                    || s == "OK" || s == "&OK")
                {
                    RECT r;
                    GetWindowRect(c, out r);
                    SetForegroundWindow(h);
                    ClickRect(r);
                    SendMessage(c, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
                }
                return true;
            }, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
    }

    static void Main(string[] args)
    {
        string kurz = "PICKADOC DOKU";
        string text = "";
        string pat = "";
        string lastName = "";
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--kurz" && i + 1 < args.Length) kurz = args[++i];
            else if (args[i] == "--text" && i + 1 < args.Length) text = args[++i];
            else if (args[i] == "--pat" && i + 1 < args.Length) pat = args[++i];
            else if (args[i] == "--name" && i + 1 < args.Length) lastName = args[++i];
        }
        if (text == "")
        {
            Console.WriteLine("usage: DensUiDeliver --kurz \"...\" --text \"...\" [--pat N] [--name Nachname]");
            Environment.Exit(2);
        }
        if (kurz.Length > 60) kurz = kurz.Substring(0, 60);

        var pid = Pid();
        if (pid == 0) { Console.WriteLine("no DensOffice"); Environment.Exit(1); }

        IntPtr main = IntPtr.Zero;
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var t = new StringBuilder(256);
            GetWindowText(h, t, 256);
            RECT r;
            GetWindowRect(h, out r);
            int w = r.R - r.L;
            var s = t.ToString();
            if (s.IndexOf("Behandlungsdaten", StringComparison.OrdinalIgnoreCase) >= 0 && w > 800)
                main = h;
            if (main == IntPtr.Zero && s.IndexOf("DENSoffice - [", StringComparison.OrdinalIgnoreCase) >= 0 && w > 800)
                main = h;
            return true;
        }, IntPtr.Zero);
        if (main != IntPtr.Zero)
        {
            ShowWindow(main, SW_MAXIMIZE);
            SetForegroundWindow(main);
        }
        Thread.Sleep(300);
        DismissOk(pid);
        Thread.Sleep(200);
        OpenPatient(pid, main, pat, lastName);
        Thread.Sleep(200);
        DismissOk(pid);

        IntPtr leistung = IntPtr.Zero, ueber = IntPtr.Zero;
        RECT ueberRect = new RECT();
        FindKette(pid, ref leistung, ref ueber, ref ueberRect);
        if (leistung == IntPtr.Zero)
        {
            SendF8(main);
            DismissOk(pid);
            FindKette(pid, ref leistung, ref ueber, ref ueberRect);
        }

        Console.WriteLine("leistung=" + leistung.ToInt64().ToString("X") + " ueber=" + ueber.ToInt64().ToString("X"));
        if (leistung == IntPtr.Zero || ueber == IntPtr.Zero)
        {
            Console.WriteLine("no kettenerfassung");
            Environment.Exit(1);
        }
        SetForegroundWindow(main);
        SetFocus(leistung);
        SendMessage(leistung, WM_SETTEXT, IntPtr.Zero, "notiz");
        Thread.Sleep(200);
        ClickRect(ueberRect);
        SendMessage(ueber, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
        Thread.Sleep(800);
        DismissOk(pid);

        IntPtr dlg = IntPtr.Zero;
        for (int n = 0; n < 8 && dlg == IntPtr.Zero; n++)
        {
            EnumWindows((h, l) =>
            {
                uint wpid;
                GetWindowThreadProcessId(h, out wpid);
                if (wpid != pid || !IsWindowVisible(h)) return true;
                var t = new StringBuilder(256);
                GetWindowText(h, t, 256);
                if (t.ToString().IndexOf("Leistung", StringComparison.OrdinalIgnoreCase) >= 0
                    && t.ToString().IndexOf("ndern", StringComparison.OrdinalIgnoreCase) >= 0)
                    dlg = h;
                return true;
            }, IntPtr.Zero);
            if (dlg == IntPtr.Zero) Thread.Sleep(250);
        }
        if (dlg == IntPtr.Zero) { Console.WriteLine("no dialog"); Environment.Exit(1); }

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
            int w = r.R - r.L, ht = r.B - r.T;
            string name = cls.ToString();
            string t = title.ToString();
            if (name == "Edit" && ht >= 16 && ht <= 32 && w > 200 && w < 500) beschreibung = c;
            if (name == "Edit" && ht > 50 && w > 200) anmerkungen = c;
            if (name == "Button" && t.IndexOf("ndern", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                aendern = c;
                aendernRect = r;
            }
            return true;
        }, IntPtr.Zero);

        SetForegroundWindow(dlg);
        if (beschreibung != IntPtr.Zero) SendMessage(beschreibung, WM_SETTEXT, IntPtr.Zero, kurz);
        if (anmerkungen != IntPtr.Zero) SendMessage(anmerkungen, WM_SETTEXT, IntPtr.Zero, text);
        Thread.Sleep(200);
        if (aendern == IntPtr.Zero) { Console.WriteLine("no Aendern"); Environment.Exit(1); }
        ClickRect(aendernRect);
        SendMessage(aendern, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
        Thread.Sleep(400);
        DismissOk(pid);
        Console.WriteLine("ok kurz=[" + kurz + "] chars=" + text.Length);
    }
}
