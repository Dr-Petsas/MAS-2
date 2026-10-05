# Read-only probe of DensEdaUtils exports. No Bank writes.
import ctypes
import ctypes.wintypes as wt
from ctypes import wintypes

DLL = r"C:\Dens\DensOffice\Module\DensEdaUtils.dll"

NAMES = [
    "getDoxVersion", "getEdaVersion", "getLicenseStatus",
    "getMandantenCount", "getMandantByNr",
    "GetAktPatientNr", "GetPatient", "GetPatientV2", "GetPatientDaten",
    "WriteNotizPatient", "WriteNotizPatientV2",
    "WriteExtDokPatient", "WriteExtDokPatientV2",
    "userLogin", "userLogout",
]

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.LoadLibraryW.argtypes = [wt.LPCWSTR]
k32.LoadLibraryW.restype = wt.HMODULE
k32.GetProcAddress.argtypes = [wt.HMODULE, wt.LPCSTR]
k32.GetProcAddress.restype = ctypes.c_void_p

h = k32.LoadLibraryW(DLL)
print("load", hex(h or 0), "err", ctypes.get_last_error())
for name in NAMES:
    p = k32.GetProcAddress(h, name.encode("ascii"))
    print(f"  {name:28} {hex(p) if p else 'MISSING'}")

eda = ctypes.WinDLL(DLL)

def try_call(label, fn, restype, *args):
    try:
        fn.restype = restype
        r = fn(*args)
        print(f"CALL {label} -> {r!r}")
    except Exception as e:
        print(f"CALL {label} FAIL {e}")

# versions often return const char* or fill a buffer
buf = ctypes.create_string_buffer(256)
wbuf = ctypes.create_unicode_buffer(256)

if hasattr(eda, "getEdaVersion"):
    try_call("getEdaVersion()", eda.getEdaVersion, ctypes.c_int)
    try_call("getEdaVersion(buf)", eda.getEdaVersion, ctypes.c_int, buf)
    print("  buf", buf.value)

if hasattr(eda, "getDoxVersion"):
    try_call("getDoxVersion()", eda.getDoxVersion, ctypes.c_int)
    try_call("getDoxVersion(buf)", eda.getDoxVersion, ctypes.c_int, buf)

if hasattr(eda, "getMandantenCount"):
    try_call("getMandantenCount()", eda.getMandantenCount, ctypes.c_int)

if hasattr(eda, "getLicenseStatus"):
    try_call("getLicenseStatus()", eda.getLicenseStatus, ctypes.c_int)
    try_call("getLicenseStatus(1)", eda.getLicenseStatus, ctypes.c_int, ctypes.c_int(1))

if hasattr(eda, "GetAktPatientNr"):
    try_call("GetAktPatientNr()", eda.GetAktPatientNr, ctypes.c_uint)
    try_call("GetAktPatientNr(ptr)", eda.GetAktPatientNr, ctypes.c_int, ctypes.byref(ctypes.c_uint()))
