using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
class P {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool SetDllDirectory(string p);
  [DllImport("DensEdaUtils.dll", CallingConvention=CallingConvention.StdCall)] static extern int getMandantenCount();
  [DllImport("DensEdaUtils.dll", CallingConvention=CallingConvention.StdCall)] static extern int getLicenseStatus();
  [DllImport("DensEdaUtils.dll", CallingConvention=CallingConvention.StdCall)] static extern uint GetAktPatientNr();
  [DllImport("DensEdaUtils.dll", CallingConvention=CallingConvention.StdCall, CharSet=CharSet.Ansi)] static extern int GetPatient(uint n, StringBuilder name, int len);
  static void Main() {
    var m = @"C:\Dens\DensOffice\Module";
    Directory.SetCurrentDirectory(m);
    SetDllDirectory(m);
    Console.WriteLine("mandanten="+getMandantenCount()+" license="+getLicenseStatus()+" akt="+GetAktPatientNr());
    var sb = new StringBuilder(256);
    Console.WriteLine("GetPatient2="+GetPatient(2, sb, 256)+" name=["+sb+"]");
  }
}
