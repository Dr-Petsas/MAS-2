using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
internal static class Program {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  delegate bool EnumProc(IntPtr h, IntPtr l);
  const uint BM_CLICK = 0x00F5;
  static void Main() {
    uint pid=0;
    foreach (var p in Process.GetProcessesByName("DensOffice"))
      if (p.MainWindowHandle != IntPtr.Zero) pid=(uint)p.Id;
    EnumWindows((h,l)=>{
      uint wpid; GetWindowThreadProcessId(h,out wpid);
      if (wpid!=pid || !IsWindowVisible(h)) return true;
      var t=new StringBuilder(64); GetWindowText(h,t,64);
      if (t.ToString()=="Hinweis") {
        EnumChildWindows(h,(c,x)=>{
          var ct=new StringBuilder(32); GetWindowText(c,ct,32);
          if (ct.ToString().IndexOf("OK")>=0) SendMessage(c,BM_CLICK,IntPtr.Zero,IntPtr.Zero);
          return true;
        },IntPtr.Zero);
      }
      return true;
    },IntPtr.Zero);
    Console.WriteLine("ok");
  }
}
