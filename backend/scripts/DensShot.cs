using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    struct RECT { public int L, T, R, B; }
    const int SW_RESTORE = 9;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;

    static void Main(string[] args)
    {
        IntPtr hwnd = IntPtr.Zero;
        EnumWindows((h, l) =>
        {
            if (!IsWindowVisible(h)) return true;
            var t = new StringBuilder(256);
            GetWindowText(h, t, 256);
            RECT wr;
            GetWindowRect(h, out wr);
            int ww = wr.R - wr.L, hh = wr.B - wr.T;
            var s = t.ToString();
            if (s.IndexOf("Behandlungsdaten") >= 0 && ww > 800) { hwnd = h; return false; }
            if (s.IndexOf("Patientendaten") >= 0 && ww > 800 && hwnd == IntPtr.Zero) hwnd = h;
            if (hwnd == IntPtr.Zero && s.IndexOf("DENSoffice - [") >= 0 && ww > 800) hwnd = h;
            return true;
        }, IntPtr.Zero);
        if (hwnd == IntPtr.Zero) { Console.WriteLine("no window"); return; }
        SetForegroundWindow(hwnd);
        System.Threading.Thread.Sleep(400);
        RECT r;
        GetWindowRect(hwnd, out r);
        Console.WriteLine("rect " + r.L + "," + r.T + " " + (r.R - r.L) + "x" + (r.B - r.T) + " title-hit");
        if (args.Length > 0 && args[0] == "click")
        {
            int x = int.Parse(args[1]);
            int y = int.Parse(args[2]);
            SetCursorPos(x, y);
            System.Threading.Thread.Sleep(80);
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            System.Threading.Thread.Sleep(40);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            Console.WriteLine("clicked " + x + "," + y);
            return;
        }
        int w = r.R - r.L; int ht = r.B - r.T;
        if (w < 100 || ht < 100) { Console.WriteLine("tiny"); return; }
        using (var bmp = new Bitmap(w, ht))
        using (var g = Graphics.FromImage(bmp))
        {
            g.CopyFromScreen(r.L, r.T, 0, 0, new Size(w, ht));
            var path = args.Length > 0 ? args[0] : @"F:\MAS-2\backend\scripts\dens-shot.png";
            bmp.Save(path, ImageFormat.Png);
            Console.WriteLine("saved " + path);
        }
    }
}
