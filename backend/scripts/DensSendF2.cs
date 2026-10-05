using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
internal static class Program {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] static extern void keybd_event(byte b, byte s, uint f, UIntPtr e);
  const uint UP = 2;
  static void Main() {
    IntPtr hwnd = IntPtr.Zero;
    foreach (var p in Process.GetProcessesByName("DensOffice"))
      if (p.MainWindowHandle != IntPtr.Zero) hwnd = p.MainWindowHandle;
    ShowWindow(hwnd, 9);
    SetForegroundWindow(hwnd);
    Thread.Sleep(300);
    keybd_event(0x71, 0, 0, UIntPtr.Zero);
    Thread.Sleep(40);
    keybd_event(0x71, 0, UP, UIntPtr.Zero);
    Console.WriteLine("F2");
  }
}
