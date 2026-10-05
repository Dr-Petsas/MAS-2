using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

internal static class Program
{
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr extra);
    const int SW_RESTORE = 9;
    const byte VK_F8 = 0x77;
    const uint KEYEVENTF_KEYUP = 2;

    static void Main()
    {
        IntPtr hwnd = IntPtr.Zero;
        foreach (var p in Process.GetProcessesByName("DensOffice"))
            if (p.MainWindowHandle != IntPtr.Zero) hwnd = p.MainWindowHandle;
        if (hwnd == IntPtr.Zero) { Console.WriteLine("no window"); return; }
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
        Thread.Sleep(400);
        keybd_event(VK_F8, 0, 0, UIntPtr.Zero);
        Thread.Sleep(50);
        keybd_event(VK_F8, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        Console.WriteLine("F8 sent");
    }
}
