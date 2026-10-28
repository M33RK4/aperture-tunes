; adds the "create a desktop shortcut" tickbox page to the installer.
; createDesktopShortcut is off in package.json so this page is the only thing that decides

!ifndef BUILD_UNINSTALLER
  Var shortcutCheckbox
  Var wantDesktopShortcut ; "0" means no, anything else means yes
!endif

; the page code has to live in here, it breaks if it loads before the installer's ui stuff
!macro customPageAfterChangeDir
  !include nsDialogs.nsh
  !include LogicLib.nsh

  Page custom ShortcutPageCreate ShortcutPageLeave

  Function ShortcutPageCreate
    !insertmacro MUI_HEADER_TEXT "Shortcuts" "Choose whether to add a shortcut to your desktop."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateCheckbox} 0 0 100% 12u "Create a &desktop shortcut"
    Pop $shortcutCheckbox
    ${If} $wantDesktopShortcut != "0"
      ${NSD_Check} $shortcutCheckbox
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function ShortcutPageLeave
    ${NSD_GetState} $shortcutCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $wantDesktopShortcut "1"
    ${Else}
      StrCpy $wantDesktopShortcut "0"
    ${EndIf}
  FunctionEnd
!macroend

!macro customInstall
  ${If} $wantDesktopShortcut != "0"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${Else}
    Delete "$newDesktopLink" ; reinstalling without the tick removes the old shortcut
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
!macroend
