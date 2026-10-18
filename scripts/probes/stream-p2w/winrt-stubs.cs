// lane stream-p2w-capture-probe — OFF-BOX compile check only (offbox-check.ps1): the WinRT surface wgc-probe.cs touches, as plain C# stubs (the real ones come from WinMetadata).
using System;
namespace Windows.Foundation {
  public enum AsyncStatus { Started = 0, Completed = 1, Canceled = 2, Error = 3 }
  public interface IAsyncInfo { AsyncStatus Status { get; } }
  public interface IAsyncOperation<T> : IAsyncInfo { T GetResults(); }
  public delegate void TypedEventHandler<TSender, TResult>(TSender sender, TResult args);
}
namespace Windows.Graphics { public struct SizeInt32 { public int Width; public int Height; } }
namespace Windows.Graphics.DirectX { public enum DirectXPixelFormat { R16G16B16A16Float = 10, B8G8R8A8UIntNormalized = 87 } }
namespace Windows.Graphics.DirectX.Direct3D11 { public interface IDirect3DDevice : IDisposable { } public interface IDirect3DSurface : IDisposable { } }
namespace Windows.Security.Authorization.AppCapabilityAccess { public enum AppCapabilityAccessStatus { DeniedBySystem, NotDeclaredByApp, DeniedByUser, UserPromptRequired, Allowed } }
namespace Windows.Graphics.Capture {
  using Windows.Foundation; using Windows.Graphics; using Windows.Graphics.DirectX; using Windows.Graphics.DirectX.Direct3D11;
  public sealed class GraphicsCaptureItem { public string DisplayName { get { return ""; } } public SizeInt32 Size { get { return new SizeInt32(); } } public event TypedEventHandler<GraphicsCaptureItem, object> Closed; void F() { Closed(null, null); } }
  public sealed class Direct3D11CaptureFrame : IDisposable { public IDirect3DSurface Surface { get { return null; } } public SizeInt32 ContentSize { get { return new SizeInt32(); } } public TimeSpan SystemRelativeTime { get { return TimeSpan.Zero; } } public void Dispose() { } }
  public sealed class GraphicsCaptureSession : IDisposable { public bool IsCursorCaptureEnabled { get; set; } public bool IsBorderRequired { get; set; } public TimeSpan MinUpdateInterval { get; set; } public void StartCapture() { } public void Dispose() { } }
  public sealed class Direct3D11CaptureFramePool : IDisposable {
    public static Direct3D11CaptureFramePool CreateFreeThreaded(IDirect3DDevice d, DirectXPixelFormat f, int n, SizeInt32 s) { return null; }
    public event TypedEventHandler<Direct3D11CaptureFramePool, object> FrameArrived; void F() { FrameArrived(null, null); }
    public Direct3D11CaptureFrame TryGetNextFrame() { return null; } public void Recreate(IDirect3DDevice d, DirectXPixelFormat f, int n, SizeInt32 s) { }
    public GraphicsCaptureSession CreateCaptureSession(GraphicsCaptureItem i) { return null; } public void Dispose() { }
  }
  public enum GraphicsCaptureAccessKind { Borderless = 0, Programmatic = 1 }
  public static class GraphicsCaptureAccess { public static IAsyncOperation<Windows.Security.Authorization.AppCapabilityAccess.AppCapabilityAccessStatus> RequestAccessAsync(GraphicsCaptureAccessKind k) { return null; } }
}
namespace System.Runtime.InteropServices.WindowsRuntime { public interface IActivationFactory { object ActivateInstance(); } public static class WindowsRuntimeMarshal { public static IActivationFactory GetActivationFactory(Type t) { return null; } } }
