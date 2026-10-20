template <class T, class... Args> class Handler final : public T {
  std::atomic<ULONG> refs{1};
  std::function<HRESULT(Args...)> fn;

public:
  Handler(std::function<HRESULT(Args...)> f) : fn(f) {}
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void **v) override {
    if (id == IID_IUnknown || id == __uuidof(T)) {
      *v = static_cast<T *>(this);
      AddRef();
      return S_OK;
    }
    *v = nullptr;
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++refs; }
  ULONG STDMETHODCALLTYPE Release() override {
    auto r = --refs;
    if (!r)
      delete this;
    return r;
  }
  HRESULT STDMETHODCALLTYPE Invoke(Args... a) override { return fn(a...); }
};
