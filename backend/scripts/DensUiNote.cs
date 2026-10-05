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
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    struct RECT { public int L, T, R, B; }
    const uint WM_SETTEXT = 0x000C;
    const uint BM_CLICK = 0x00F5;

    static uint Pid()
    {
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) return (uint)p.Id;
        return 0;
    }

    static string Title(IntPtr h)
    {
        var s = new StringBuilder(256);
        GetWindowText(h, s, 256);
        return s.ToString();
    }
    static string Cls(IntPtr h)
    {
        var s = new StringBuilder(64);
        GetClassName(h, s, 64);
        return s.ToString();
    }

    static void Main()
    {
        var pid = Pid();
        IntPtr hinweisOk = IntPtr.Zero, remark = IntPtr.Zero, bearbeiten = IntPtr.Zero, main = IntPtr.Zero;
        EnumWindows((h, l) =>
        {
            uint wpid;
            GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var t = Title(h);
            if (t.IndexOf("DENSoffice", StringComparison.OrdinalIgnoreCase) >= 0) main = h;
            if (t == "Hinweis")
            {
                EnumChildWindows(h, (c, x) =>
                {
                    if (Title(c).IndexOf("OK", StringComparison.OrdinalIgnoreCase) >= 0) hinweisOk = c;
                    return true;
                }, IntPtr.Zero);
            }
            EnumChildWindows(h, (c, x) =>
            {
                if (!IsWindowVisible(c)) return true;
                RECT r;
                GetWindowRect(c, out r);
                var w = r.R - r.L; var ht = r.B - r.T;
                if (Cls(c) == "Edit" && w > 500 && ht > 200) remark = c;
                if (Title(c) == "Bearbeiten" && r.T > 550) bearbeiten = c;
                return true;
            }, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);

        Console.WriteLine("hinweisOk=" + hinweisOk.ToInt64().ToString("X") + " remark=" + remark.ToInt64().ToString("X") + " bearbeiten=" + bearbeiten.ToInt64().ToString("X"));
        if (hinweisOk != IntPtr.Zero)
        {
            SendMessage(hinweisOk, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
            Console.WriteLine("Hinweis OK");
            Thread.Sleep(400);
        }
        if (main != IntPtr.Zero) SetForegroundWindow(main);
        if (bearbeiten != IntPtr.Zero)
        {
            SendMessage(bearbeiten, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
            Console.WriteLine("Bearbeiten");
            Thread.Sleep(400);
        }
        if (remark != IntPtr.Zero)
        {
            var text = "PICKADOC DOKU (Test)\r\nAnlass: Implantation OP klein · 60 min\r\nAnamnese: Hepatitis B, Viread 245, Allergie Penicillin\r\nDokumente: Anamnesebogen, CareCapital, Datenschutz, KI-Telefonie";
            SendMessage(remark, WM_SETTEXT, IntPtr.Zero, text);
            Console.WriteLine("remark set");
        }
    }
}
