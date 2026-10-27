param(
  [Parameter(Mandatory)][string]$Icon,
  [Parameter(Mandatory)][string]$BunPath,
  [Parameter(Mandatory)][string]$LauncherPath
)
$ErrorActionPreference = 'Stop'
# Hutch adds numeric group 1; Bun 1.4 also contains named IDI_MYICON, which
# Windows prefers. Update all existing groups/languages without deleting other
# PE resources. Remove when Hutch replaces every original executable icon group.
Add-Type @'
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class StationExecutableIcons {
  delegate bool NameProc(IntPtr m, IntPtr t, IntPtr n, IntPtr p);
  delegate bool LangProc(IntPtr m, IntPtr t, IntPtr n, ushort l, IntPtr p);
  sealed class Group { public string Name; public int Id; public ushort Language; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr LoadLibraryEx(string path,IntPtr f,uint flags);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool EnumResourceNames(IntPtr m,IntPtr t,NameProc cb,IntPtr p);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool EnumResourceLanguages(IntPtr m,IntPtr t,IntPtr n,LangProc cb,IntPtr p);
  [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr m);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr BeginUpdateResource(string path,bool clear);
  [DllImport("kernel32.dll",EntryPoint="UpdateResourceW",SetLastError=true)] static extern bool UpdateId(IntPtr update,IntPtr type,IntPtr name,ushort lang,byte[] data,uint length);
  [DllImport("kernel32.dll",EntryPoint="UpdateResourceW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool UpdateName(IntPtr update,IntPtr type,string name,ushort lang,byte[] data,uint length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool EndUpdateResource(IntPtr update,bool discard);
  static void Check(bool success) { if (!success) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
  public static void Apply(string path,string icon) {
    var bytes=File.ReadAllBytes(icon);
    if (bytes.Length<6 || BitConverter.ToUInt16(bytes,0)!=0 || BitConverter.ToUInt16(bytes,2)!=1) throw new Exception("Invalid Station ICO");
    int count=BitConverter.ToUInt16(bytes,4);
    if (count<1 || count>256 || bytes.Length<6+16*count) throw new Exception("Invalid Station ICO directory");
    var images=new List<byte[]>(); var group=new byte[6+14*count];
    Buffer.BlockCopy(bytes,0,group,0,6);
    for(int i=0;i<count;i++) {
      int entry=6+16*i; uint length=BitConverter.ToUInt32(bytes,entry+8), offset=BitConverter.ToUInt32(bytes,entry+12);
      if (length==0 || offset<6+16*count || (ulong)offset+length>(ulong)bytes.Length) throw new Exception("Invalid Station ICO image");
      var image=new byte[length]; Buffer.BlockCopy(bytes,(int)offset,image,0,(int)length); images.Add(image);
      Buffer.BlockCopy(bytes,entry,group,6+14*i,12);
      Buffer.BlockCopy(BitConverter.GetBytes((ushort)(i+1)),0,group,6+14*i+12,2);
    }
    var groups=new List<Group>(); IntPtr module=LoadLibraryEx(path,IntPtr.Zero,2);
    if(module==IntPtr.Zero) throw new Exception("Cannot inspect executable resources");
    try {
      Check(EnumResourceNames(module,(IntPtr)14,(m,t,n,p)=> {
        long raw=n.ToInt64(); string name=raw>65535?Marshal.PtrToStringUni(n):null;
        return EnumResourceLanguages(module,t,n,(a,b,c,l,q)=> { groups.Add(new Group {Name=name,Id=name==null?(int)raw:0,Language=l});return true;},IntPtr.Zero);
      },IntPtr.Zero));
    } finally { FreeLibrary(module); }
    var update=BeginUpdateResource(path,false); if(update==IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    bool committed=false;
    try {
      foreach(var resource in groups) {
        for(int i=0;i<count;i++) Check(UpdateId(update,(IntPtr)3,(IntPtr)(i+1),resource.Language,images[i],(uint)images[i].Length));
        Check(resource.Name==null ? UpdateId(update,(IntPtr)14,(IntPtr)resource.Id,resource.Language,group,(uint)group.Length)
          : UpdateName(update,(IntPtr)14,resource.Name,resource.Language,group,(uint)group.Length));
      }
      Check(EndUpdateResource(update,false)); committed=true;
    } finally { if(!committed) EndUpdateResource(update,true); }
  }
}
'@
[StationExecutableIcons]::Apply([IO.Path]::GetFullPath($BunPath), [IO.Path]::GetFullPath($Icon))
[StationExecutableIcons]::Apply([IO.Path]::GetFullPath($LauncherPath), [IO.Path]::GetFullPath($Icon))
Write-Host 'Replaced all app executable icon groups with Station branding.'
