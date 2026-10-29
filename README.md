# Aperture Tunes

Have you ever downloaded a song online and when you opened a music manager app on your phone you realized that the tags were off? Well thats what this little program that I made for myself is for. It cleans up your music files. Its styled like the screens you see on the monitors in Portal because I really love Portal and music. For now I am satisfied with it just being a tag program but I plan on eventually turning it into a music player. Also keep in mind that this is still not bug free so I will be working on that.

I made it with the assistance of Opus 5.5

You drop your songs in, and it looks each one up online and fixes it:

- **Tags:** correct title, artist, album, track number, year and genre.
- **Album cover:** adds the proper cover art.
- **Filename:** renames the file to just the song title, so `01. Artist - Song (Official Video) [320kbps].mp3` becomes `Song.mp3`.
- **Artist:** tags only the **main artist**, so songs with features don't scatter across your music app. "Calvin Harris, Dua Lipa" is tagged as just Calvin Harris.

When it's done, you choose: either **overwrite your original files** with the fixed ones, or save the fixed songs into a **new folder**, sorted by album, wherever you like. Nothing touches your originals until you pick overwrite and confirm it.

This is a personal fan project, not a real product. It isn't for sale and isn't affiliated with Valve in any way.

---

## Installing

1. Run **`Aperture Tunes Setup.exe`**. It asks where to install it and whether you want a desktop shortcut.
   (If you got **`Aperture Tunes Portable.exe`** instead, just double-click it. Nothing gets installed, it just starts a bit slower each time.)
2. The first time you open it, it asks for a username. That's only for the screen. It stays on your PC and isn't sent anywhere.

### ⚠ Security warning (for the antivirus protections)

Windows will probably show **"Windows protected your PC"** screen when you first run it. This happens because the app isn't "signed": signing costs money and doesn't make sense for a hobby project. To open it anyway:

> Click **More info** → **Run anyway**

Some antivirus programs may also be suspicious of it for the same reason. Only do this if you got the file directly from me.

**You'll need:** a 64-bit Windows PC and an internet connection, because the app looks songs up online.

---

## How to use it

1. **Add songs** by dropping `.mp3` / `.flac` files anywhere on the window, or click **CLICK TO BROWSE** to open the built-in **File Access Terminal**:
   - Click folders to open them. **[ UP ]** goes back a level, and you can also type a path into the bar.
   - Tick the songs you want. **Shift-click** selects a range, and **[ SELECT ALL ]** grabs the whole folder.
   - **[ ADD WHOLE FOLDER ]** loads every song in the folder. Tick **INCLUDE SUBFOLDERS** to dig into the folders inside it too.
   - Drag the line between the side list and the files to make the side list wider or narrower.
   - Then **[ LOAD ]**. It remembers the last folder you were in.
2. Click **[ TEST ]**. It looks up each song, at about 20 songs a minute (the music databases limit how fast it can ask).
3. **Check the results.** Every song shows what it matched and how confident it is (`|||||||||. 94%`).
   - Click **[ EDIT ]** on a song to pick a different match, change any field, or search again with your own text, like `Artist - Song`.
   - Untick a song to leave it out.
   - **VERIFY** (in blue) means it wasn't fully sure, so give that one a look.
4. Click **[ APPLY ]**, then **[ SAVE ]** and pick one:
   - **Overwrite originals:** puts the tagged songs back where they came from, renamed to the clean title. The old untagged files are replaced and **can't be brought back**, so it asks first. Songs you dragged in can't be overwritten, only ones picked in the file browser.
   - **New folder:** pick a spot in the same built-in file browser and click **[ SAVE HERE ]**. It makes a **Tagged Songs** folder there, with a subfolder for each album. Your originals stay untouched.

Options at the bottom of the song list:

- **FEAT. IN TITLE:** keeps "(feat. Someone)" in the song title.
- **TRACK # IN FILENAME:** names files `05 - Song.mp3` instead of `Song.mp3`.

### Good to know

- **Singles:** if a song was only released as a single, its album is set to the single (e.g. _One Kiss - Single_), so it never ends up under "Unknown Album". If a song is on both an album and a single, it prefers the album.
- **No match:** if it can't find a song, it leaves that song alone when saving instead of saving it half-tagged (it's not overwritten either). Try **[ EDIT ]** → search with the artist and title.
- **Unsupported formats:** `.m4a`, `.ogg` and `.wma` files aren't supported yet. They'll show up as UNSUPPORTED and get skipped.
- **The numbers in the small box next to the logo** are your average match confidence, songs tagged all-time, and minutes in this session.
- **The ☰ button** next to the window buttons opens the options. There you can move the window buttons to the right side, and the clock and logo swap over to the left.
- **Change your username** by clicking `User:` in the bottom-left corner.

---

## Credits

- **Portal, Portal 2, Aperture Science and the Aperture logo** belong to **Valve Corporation**. I'm just a fan. The logo and the terminal look are used here out of love for the game, in a free personal project.
- **Song info** comes from the **iTunes Search API**, with **MusicBrainz** and the **Cover Art Archive** as backup.
- **Font:** [Archivo](https://fonts.google.com/specimen/Archivo) by Omnibus-Type, used under the SIL Open Font License.
- Built with Electron and Node.js.

The cake is a lie, but the tags are accurate. :D

---

<details>
<summary>For the nerdy: building it yourself</summary>

You need Node.js 18+. In this folder:

```
npm install
npm start        # run the app
npm run dist     # build the .exe files into dist/
```

Tagged copies are written to `%TEMP%\aperture-tunes` while the app runs. Your username and settings are kept in `%APPDATA%\Aperture Tunes\profile.json`.

</details>
