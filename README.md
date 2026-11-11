# Aperture Tunes

Have you ever downloaded a song online and when you opened a music manager app on your phone you realized that the tags were off? Well thats what this little program that I made for myself is for. It cleans up your music files. Its styled like the screens you see on the monitors in Portal because I really love Portal and music. It started out as just a tag program, but now it's a full music player too. Also keep in mind that this is still not bug free so I will be working on that.

I made it with the assistance of Opus 5.5

It's two things in one:

- **A music player** for the songs on your PC: your library sorted by album, artist and genre, a queue, playlists, an equalizer, and two visualizers that fit the Portal look.
- **A tagger** that looks songs up online and fixes their title, artist, album, cover art, track number, year and genre, and cleans up messy filenames.

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

**You'll need:** a 64-bit Windows PC. The player works offline; the tagger needs internet because it looks songs up online.

---

## The music player

When you open the app it shows your **library**: every song in your Windows **Music** folder. If your music is somewhere else, open **⚙ OPTIONS** at the bottom of the side menu and use **[ ADD FOLDER ]**. You can add as many folders as you want.

**Library**
- **ALBUMS / ARTISTS / GENRES / ALL SONGS** at the top change how it's sorted. Albums can be shown as a **[ LIST ]** or a **[ GRID ]** of covers; click a cover to open the album.
- Type in **SEARCH** to find a song, artist or album.
- **Click** a song to tick it, **shift-click** to tick a range.
- **Double-click** a song to play it. If something is already playing, it goes to the bottom of the queue instead of interrupting.
- **[ ADD TO QUEUE ]** adds the ticked songs, **[ PLAY NOW ]** replaces the queue with them. With nothing ticked they work on the whole list.
- Tick one song and the bottom bar shows how many times you've played it, when you last did, and how long you've listened to it.
- **Right-click** a song (or an album cover) for more: play now, play next, add to queue, add to a playlist, play or go to the album, view statistics, and edit tags. With several songs ticked, it works on all of them.

**Queue and playlists**
- **QUEUE** shows what's coming up. Drag **≡** to reorder, **✕** to remove, double-click to jump to a song.
- **[ SAVE AS PLAYLIST ]** turns the queue into a playlist. Your playlists show up in the side menu.
- Playing a playlist **replaces** the queue and starts right away. Playlists can be renamed, deleted and reordered.

**Now playing**
- Four looks to pick from in the options (**NOW PLAYING DISPLAY**):
  - **ALBUM ART:** the cover. Click it and a record slides out and spins while the song plays; click again to put it back.
  - **OSCILLOSCOPE:** the waveform, like an old lab monitor.
  - **APERTURE:** the logo's 8 blades open up with the music, each one following its own part of the sound.
  - **CASSETTE:** a tape between two VU meters. The reels turn, the tape winds from one reel to the other as the song goes, and the needles follow the left and right channels.
- Pausing freezes the record, the reels and everything else right where they are.
- It also shows the format, quality, how many times you've played the song and when you last played it.

**The player bar** at the bottom has shuffle, previous, play/pause, next and repeat (click repeat again for **repeat one**, it shows a little 1), the seek bar and volume. **Space** plays/pauses, **Ctrl + ← / →** skips. Your keyboard's media keys work too.

**Equalizer**
- Page **1 // BANDS**: turn it **[ ON ]** and pick **3, 5, 10, 15 or 31** bands. Drag a slider up or down, double-click to reset it. Switching band count keeps the shape of your curve.
- Page **2 // EFFECTS**: dials for **bass boost**, **surround** (makes stereo sound wider) and **channel balance**, plus **stereo / mono**, volume, and a **preamp** (off, headroom to make room for EQ boosts, or a boost). Drag a dial up or down, double-click to reset it.

**Statistics**
- **STATISTICS** in the side menu: total time listened, songs played, today, your longest listening session, a chart of minutes per day, and your top artists, albums and genres. Pick **7 DAYS / 30 DAYS / ALL TIME** at the top.
- Right-click a song or album and pick **VIEW STATISTICS** for its own numbers: plays, time listened, first and last played, where it ranks, how often you skipped it, and plays per week.
- Listening time is counted from version 2.0.0 on. Play counts from before that carried over.

**Options (⚙ at the bottom of the side menu)**
- **Music folders** and **[ RESCAN LIBRARY ]** (it also rescans on its own every time you open the app).
- **Now playing display:** album art, oscilloscope, aperture or cassette.
- **Crossfade:** fades one song into the next, 0 to 12 seconds.
- **When closing the window:** quit, keep playing in the **tray** by the clock, or switch to a **mini player** you can drag anywhere (it stays on top, the pin button turns that off).
- **Cover art colours:** the amber tint that fits the screen, or the original colours. Hovering a cover always shows its real colours.
- **Window buttons:** left or right (the clock and logo swap to the other side).

---

## The tagger

It's in the side menu under **TOOLS**. If some songs in your library are missing their tags, **NEEDS TAGGING** shows up in red above it, and **[ SEND TO TAGGER ]** loads them straight in.

What it fixes:

- **Tags:** correct title, artist, album, track number, year and genre.
- **Album cover:** adds the proper cover art.
- **Filename:** renames the file to just the song title, so `01. Artist - Song (Official Video) [320kbps].mp3` becomes `Song.mp3`.
- **Artist:** tags only the **main artist**, so songs with features don't scatter across your music app. "Calvin Harris, Dua Lipa" is tagged as just Calvin Harris.

How to use it:

1. **Add songs** by dropping `.mp3` / `.flac` files anywhere on the window, or click **CLICK TO BROWSE** to open the built-in **File Access Terminal**:
   - Click folders to open them. **[ UP ]** goes back a level, and you can also type a path into the bar.
   - Tick the songs you want. **Shift-click** selects a range, and **[ SELECT ALL ]** grabs the whole folder.
   - **[ ADD WHOLE FOLDER ]** loads every song in the folder. Tick **INCLUDE SUBFOLDERS** to dig into the folders inside it too.
   - Drag the line between the side list and the files to make the side list wider or narrower.
   - Then **[ LOAD ]**. It remembers the last folder you were in.
2. Click **[ SCAN ]**. It looks up each song, at about 20 songs a minute (the music databases limit how fast it can ask).
3. **Check the results.** Every song shows what it matched and how confident it is (`|||||||||. 94%`).
   - Click **[ EDIT ]** on a song to pick a different match, change any field, or search again with your own text, like `Artist - Song`.
   - Untick a song to leave it out.
   - **VERIFY** (in blue) means it wasn't fully sure, so give that one a look.
4. Click **[ APPLY ]**, then **[ SAVE ]** and pick one:
   - **Overwrite originals:** puts the tagged songs back where they came from, renamed to the clean title. The old untagged files are replaced and **can't be brought back**, so it asks first. Songs you dragged in can't be overwritten, only ones picked in the file browser. Your playlists and queue follow the renamed files.
   - **New folder:** pick a spot in the same built-in file browser and click **[ SAVE HERE ]**. It makes a folder for each album right there, named after the album. If that album's folder already exists, the songs go into it (nothing gets replaced). Your originals stay untouched.

Options at the bottom of the song list:

- **FEAT. IN TITLE:** keeps "(feat. Someone)" in the song title.
- **TRACK # IN FILENAME:** names files `05 - Song.mp3` instead of `Song.mp3`.

---

## Good to know

- **Formats:** the player plays `.mp3`, `.flac`, `.m4a`/`.aac`, `.ogg`, `.opus` and `.wav`. The tagger only fixes `.mp3` and `.flac`; anything else shows up as UNSUPPORTED there. `.wma` and Apple Lossless `.m4a` files can't be played.
- **Singles:** if a song was only released as a single, the tagger sets its album to the single (e.g. _One Kiss - Single_), so it never ends up under "Unknown Album". If a song is on both an album and a single, it prefers the album.
- **No match:** if the tagger can't find a song, it leaves that song alone when saving instead of saving it half-tagged (it's not overwritten either). Try **[ EDIT ]** → search with the artist and title.
- **The numbers in the small box next to the logo** are how long you've listened today, how many songs you've played today, and your total listening time.
- **Change your username** by clicking `User:` at the bottom of the side menu.

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

Tagged copies are written to `%TEMP%\aperture-tunes` while the app runs. Your username, settings, playlists and queue are kept in `%APPDATA%\Aperture Tunes\profile.json`, your listening history in `stats.json`, and the library index and cover cache next to them.

</details>
