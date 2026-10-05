// 32-bit Helfer: schreibt Notiz + PDF ueber DensEdaUtils (gleicher Weg wie AppConnect).
// Kein Direktzugriff auf Bank-Dateien.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    const string Eda = "DensEdaUtils.dll";

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool SetDllDirectory(string path);

    [DllImport(Eda, CallingConvention = CallingConvention.StdCall)]
    static extern int getMandantenCount();

    [DllImport(Eda, CallingConvention = CallingConvention.StdCall)]
    static extern int getLicenseStatus();

    [DllImport(Eda, CallingConvention = CallingConvention.StdCall)]
    static extern uint GetAktPatientNr();

    [DllImport(Eda, CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    static extern int getEdaVersion(StringBuilder buf, int len);

    [DllImport(Eda, CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    static extern int WriteNotizPatient(uint patNr, string kurz, string text);

    [DllImport(Eda, CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "WriteNotizPatientV2")]
    static extern int WriteNotizPatientV2(uint patNr, string kurz, string text);

    [DllImport(Eda, CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    static extern int WriteExtDokPatient(uint patNr, string dateiname, string kurz, string anmerkung);

    [DllImport(Eda, CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "WriteExtDokPatientV2")]
    static extern int WriteExtDokPatientV2(uint patNr, string dateiname, string kurz, string anmerkung);

    [DllImport(Eda, CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    static extern int userLogin(string user, string pass);

    static int Main(string[] args)
    {
        var module = @"C:\Dens\DensOffice\Module";
        Directory.SetCurrentDirectory(module);
        SetDllDirectory(module);
        Console.OutputEncoding = Encoding.UTF8;

        try { Console.WriteLine("mandanten=" + getMandantenCount()); }
        catch (Exception e) { Console.WriteLine("mandanten FAIL " + e.Message); }
        try { Console.WriteLine("license=" + getLicenseStatus()); }
        catch (Exception e) { Console.WriteLine("license FAIL " + e.Message); }
        foreach (var pair in new[] { "Dens/", "Dens/Dens", "User/", "User/User" })
        {
            var parts = pair.Split('/');
            try
            {
                var rc = userLogin(parts[0], parts[1]);
                Console.WriteLine("login " + pair + " -> " + rc + " mandanten=" + getMandantenCount());
            }
            catch (Exception e) { Console.WriteLine("login " + pair + " FAIL " + e.Message); }
        }

        uint pat = 2;
        foreach (var a in args)
            if (a.StartsWith("--pat=")) uint.TryParse(a.Substring(6), out pat);

        var text = "KI-DOKUMENTATION PICKADOC\r\n\r\nAnlass: Demo-Test\r\nPatient: Mustermann Helmut\r\nQuelle: Lena / Pickadoc";
        var kurz = "Pickadoc Doku";
        Console.WriteLine("write note pat=" + pat);
        try { Console.WriteLine("WriteNotizPatient=" + WriteNotizPatient(pat, kurz, text)); }
        catch (Exception e) { Console.WriteLine("WriteNotizPatient FAIL " + e.Message); }
        try { Console.WriteLine("WriteNotizPatientV2=" + WriteNotizPatientV2(pat, kurz, text)); }
        catch (Exception e) { Console.WriteLine("WriteNotizPatientV2 FAIL " + e.Message); }

        var pdf = @"C:\Dens\DensOffice\Module\Datenaustausch\2-Anamnesebogen.pdf";
        if (File.Exists(pdf))
        {
            Console.WriteLine("write pdf " + pdf);
            try { Console.WriteLine("WriteExtDokPatient=" + WriteExtDokPatient(pat, pdf, "Anamnesebogen", "Pickadoc")); }
            catch (Exception e) { Console.WriteLine("WriteExtDokPatient FAIL " + e.Message); }
            try { Console.WriteLine("WriteExtDokPatientV2=" + WriteExtDokPatientV2(pat, pdf, "Anamnesebogen", "Pickadoc")); }
            catch (Exception e) { Console.WriteLine("WriteExtDokPatientV2 FAIL " + e.Message); }
        }
        return 0;
    }
}
