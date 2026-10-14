// The parts of the File System Access API that TypeScript's DOM lib doesn't ship yet
// (Chromium-based browsers). Everything is optional so callers must feature-detect.

export {}

declare global {
  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  interface SaveFilePickerOptions {
    id?: string
    suggestedName?: string
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
  }

  interface OpenFilePickerOptions {
    id?: string
    multiple?: boolean
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
  }

  interface Window {
    showSaveFilePicker?(
      options?: SaveFilePickerOptions
    ): Promise<FileSystemFileHandle>
    showOpenFilePicker?(
      options?: OpenFilePickerOptions
    ): Promise<FileSystemFileHandle[]>
  }

  interface FileSystemHandlePermissionDescriptor {
    mode?: "read" | "readwrite"
  }

  interface FileSystemHandle {
    queryPermission?(
      descriptor?: FileSystemHandlePermissionDescriptor
    ): Promise<PermissionState>
    requestPermission?(
      descriptor?: FileSystemHandlePermissionDescriptor
    ): Promise<PermissionState>
  }
}
