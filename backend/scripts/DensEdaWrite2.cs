using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    const string Eda = "DensEdaUtils.dll";
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool SetDllDirectory(string p);
    [DllImport(Eda, CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    static extern int WriteNotizPatient(uint patNr, string kurz, string text);
    [DllImport(Eda, CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    static extern int WriteExtDokPatient(uint patNr, string dateiname, string kurz, string anmerkung);
    [DllImport(Eda, CallingConvention = CallingConvention.StdCall)]
    static extern int getMandantenCount();

    static void Main(string[] args)
    {
        var module = @"C:\Dens\DensOffice\Module";
        Directory.SetCurrentDirectory(module);
        SetDllDirectory(module);
        Console.OutputEncoding = Encoding.UTF8;
        Console.WriteLine("mandanten=" + getMandantenCount());
        uint pat = 1234567;
        if (args.Length > 0) uint.TryParse(args[0], out pat);
        var text = "KI-DOKUMENTATION PICKADOC\r\nAnlass: Demo-Test\r\nPatient: Mustermann Helmut";
        Console.WriteLine("note " + pat + " -> " + WriteNotizPatient(pat, "Pickadoc Doku", text));
        var pdf = @"C:\Dens\DensOffice\Module\Datenaustausch\2-Anamnesebogen.pdf";
        if (File.Exists(pdf))
            Console.WriteLine("pdf " + pat + " -> " + WriteExtDokPatient(pat, pdf, "Anamnesebogen", "Pickadoc"));
    }
}
