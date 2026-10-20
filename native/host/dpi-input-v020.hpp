// Native mouse points remain raw client pixels. DOM geometry is CSS pixels.
double cssPixelScale = 1.0;
json dropArea = {{"x",390},{"y",70},{"width",240},{"height",180}};
bool cssContains(POINT p, double x, double y, double width, double height) {
  const double cx=p.x/cssPixelScale, cy=p.y/cssPixelScale;
  return cx>=x && cy>=y && cx<x+width && cy<y+height;
}
bool dropContains(POINT p) {
  if(settingsHwnd) return false;
  return cssContains(p,dropArea.value("x",390.0),dropArea.value("y",70.0),
      dropArea.value("width",240.0),dropArea.value("height",180.0));
}

void fitDpiWindow(HWND h) {
  static bool fitting=false;
  if(fitting || !h) return;
  fitting=true;
  RECT window{},client{}; GetWindowRect(h,&window); GetClientRect(h,&client);
  MONITORINFO monitor{}; monitor.cbSize=sizeof(monitor);
  GetMonitorInfoW(MonitorFromWindow(h,MONITOR_DEFAULTTONEAREST),&monitor);
  const double width=h==settingsHwnd?904.0:640.0;
  const double height=h==settingsHwnd?681.0:760.0;
  const int frameWidth=window.right-window.left-client.right;
  const int frameHeight=window.bottom-window.top-client.bottom;
  const auto &work=monitor.rcWork;
  const double scale=std::max(.1,std::min({GetDpiForWindow(h)/96.0,
      (work.right-work.left-frameWidth)/width,
      (work.bottom-work.top-frameHeight)/height}));
  const int w=static_cast<int>(std::floor(width*scale))+frameWidth;
  const int ht=static_cast<int>(std::floor(height*scale))+frameHeight;
  const int x=std::clamp(window.left,work.left,std::max(work.left,work.right-w));
  const int y=std::clamp(window.top,work.top,std::max(work.top,work.bottom-ht));
  if(window.right-window.left!=w || window.bottom-window.top!=ht || window.left!=x || window.top!=y)
    SetWindowPos(h,nullptr,x,y,w,ht,SWP_NOZORDER|SWP_NOACTIVATE);
  fitting=false;
}

void updateDpiController(HWND h, ICoreWebView2Controller *controller) {
  if(!h || !controller) return;
  static bool updating=false;
  if(updating) return;
  updating=true;
  RECT b{}; GetClientRect(h,&b);
  double raster=1;
  ICoreWebView2Controller3 *c3=nullptr;
  if(SUCCEEDED(controller->QueryInterface(__uuidof(ICoreWebView2Controller3),(void**)&c3))) {
    c3->put_BoundsMode(COREWEBVIEW2_BOUNDS_MODE_USE_RAW_PIXELS);
    c3->get_RasterizationScale(&raster); c3->Release();
  }
  if(!std::isfinite(raster) || raster<=0) raster=GetDpiForWindow(h)/96.0;
  const double logicalWidth=h==settingsHwnd?904.0:640.0;
  const double logicalHeight=h==settingsHwnd?681.0:760.0;
  // Normal DPI scaling, reduced only when necessary to fit the actual work area.
  const double effective=std::min(b.right/logicalWidth,b.bottom/logicalHeight);
  const double zoom=effective/raster;
  controller->SetBoundsAndZoomFactor(b,zoom);
  if(h==hwnd) cssPixelScale=effective;
  if(diagnosticsEnabled) log("dpi-layout "+json({{"dpi",GetDpiForWindow(h)},
      {"settings",h==settingsHwnd},{"width",b.right},{"height",b.bottom},
      {"raster",raster},{"zoom",zoom},{"cssScale",effective}}).dump());
  updating=false;
}

void installDpiPolicy(HWND h, ICoreWebView2Controller *controller) {
  ICoreWebView2Controller3 *c3=nullptr;
  if(SUCCEEDED(controller->QueryInterface(__uuidof(ICoreWebView2Controller3),(void**)&c3))) {
    c3->put_ShouldDetectMonitorScaleChanges(TRUE);
    auto handler=new Handler<ICoreWebView2RasterizationScaleChangedEventHandler,
        ICoreWebView2Controller*,IUnknown*>([h](ICoreWebView2Controller*c,IUnknown*) {
      fitDpiWindow(h); updateDpiController(h,c); return S_OK;
    });
    EventRegistrationToken token; c3->add_RasterizationScaleChanged(handler,&token);
    handler->Release(); c3->Release();
  }
  ICoreWebView2Controller4 *c4=nullptr;
  if(SUCCEEDED(controller->QueryInterface(__uuidof(ICoreWebView2Controller4),(void**)&c4))) {
    c4->put_AllowExternalDrop(FALSE); c4->Release();
  }
  fitDpiWindow(h); updateDpiController(h,controller);
}

void preventFileNavigation(ICoreWebView2 *target) {
  auto nav=new Handler<ICoreWebView2NavigationStartingEventHandler,
      ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs*>(
      [](ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs*a) {
    LPWSTR uri=nullptr; a->get_Uri(&uri);
    if(uri) { if(_wcsnicmp(uri,L"file:",5)==0) {a->put_Cancel(TRUE);log("file-navigation-blocked");} CoTaskMemFree(uri); }
    return S_OK;
  });
  auto nw=new Handler<ICoreWebView2NewWindowRequestedEventHandler,
      ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs*>(
      [](ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs*a) {
    LPWSTR uri=nullptr; a->get_Uri(&uri);
    if(uri) { if(_wcsnicmp(uri,L"file:",5)==0) {a->put_Handled(TRUE);log("file-window-blocked");} CoTaskMemFree(uri); }
    return S_OK;
  });
  EventRegistrationToken nt,wt; target->add_NavigationStarting(nav,&nt);
  target->add_NewWindowRequested(nw,&wt);nav->Release();nw->Release();
}
