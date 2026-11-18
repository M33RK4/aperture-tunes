# Aperture Tunes

Have you ever downloaded a song online and when you opened a music manager app on your phone you realized that the tags were off? Well thats what this little program that I made for myself is for. It cleans up your music files. Its styled like the screens you see on the monitors in Portal because I really love Portal and music. It started out as just a tag program, but now it's a full music player too. Also keep in mind that this is still not bug free so I will be working on that.

I made it with the assistance of Opus 5.5

It does two jobs:

- **It plays your music.** Your library sorted by album, artist and genre, a queue, playlists, an equalizer, lyrics, listening stats, and a few Now Playing screens that fit the Portal look. In amber or blue.
- **It fixes your tags.** The tagger looks your songs up online, fills in the right title, artist, album, cover, track number, year and genre, and cleans up messy file names while it's at it.

This is a personal fan project, not a real product. It isn't for sale and isn't affiliated with Valve in any way.

---

## Installing

Grab the newest version from the [Releases](https://github.com/M33RK4/aperture-tunes/releases) page.

Run **`Aperture Tunes Setup.exe`**. It asks where you want it and whether you'd like a desktop shortcut, and that's it. If you've got **`Aperture Tunes Portable.exe`** instead, just double-click it. Nothing gets installed, it just takes a little longer to start each time.

The first time you open it, it asks for a username. That's only for the screen and it stays on your PC.

**Updating** from an older version is the same thing: run the new Setup over the old one (or use the new portable file instead of the old one). Your library, playlists, settings and listening stats are kept in their own folder, so nothing gets lost. Once you're on 2.1, the app lets you know by itself when there's a newer version.

Every time it starts there's a short boot screen: the old terminal powers up, the logo rolls in across the name like in the Portal intro and it runs through your music before saying welcome back. Press any key or click to skip it, or turn it off in the options under **BOOT SCREEN**.

### ⚠ Security warning (for the antivirus protections)

Windows will probably show a **"Windows protected your PC"** screen the first time. That's because the app isn't "signed", and signing costs money that doesn't make sense for a hobby project. To open it anyway:

> Click **More info** → **Run anyway**

Some antivirus programs might be suspicious of it for the same reason. Only do this if you got the file straight from me.

**You'll need** a 64-bit Windows PC. The player works fine offline. The tagger and the lyric downloads need internet, since they look things up online.

---

## The music player

When you open it you land in your **library**, which is everything in your Windows Music folder. If your music lives somewhere else, go to **⚙ OPTIONS** at the bottom of the side menu and hit **[ ADD FOLDER ]**. You can add as many folders as you like, and it checks them for new songs every time you open the app.

### Finding and picking songs

Sort by **ALBUMS**, **ARTISTS**, **GENRES** or **ALL SONGS** at the top, and show albums as a **[ LIST ]** or a **[ GRID ]** of covers. **SEARCH** finds songs, artists and albums as you type, and **Ctrl+F** jumps straight to it from anywhere.

Clicking a song selects just that one (click it again to let go of it). Ctrl-click or the tick box adds songs without losing the ones you already picked, and shift-click grabs a whole range. Double-click a song to play it. If something's already playing, it goes to the end of the queue instead of cutting in.

**[ ADD TO QUEUE ]** and **[ PLAY NOW ]** work on whatever you've ticked, or on the whole list if you haven't ticked anything. With one song selected, the bar at the bottom tells you how many times you've played it, when you last did, and how long you've listened to it in total.

Right-click a song or an album cover for everything else: play now, play next, add to the queue or a playlist, go to the album, statistics, and viewing or editing its tags.

### Looking at tags

Tick **SHOW TAGS** next to the search and a **TAGS** panel shows up on the side. Select a song and you'll see its cover, title, artist, album artist, album, track and disc number, year, genre, length and file name. Anything that should be there but isn't shows up as **MISSING** in red, so the songs that need fixing are easy to spot.

**VIEW TAGS** (in the right-click menu, or **[ ALL TAGS ]** in the panel) shows everything that's actually written in the file right now, plus how big the cover is and the file's format, quality and folder. Nothing gets looked up online for this.

### Editing tags yourself

**EDIT TAGS** puts the song's title, artist, album artist, album, track and disc numbers, year and genre into boxes you can change. It's in the tags panel, in VIEW TAGS, in a song's statistics and in the right-click menu. Change what you want and press **[ SAVE ]** (or Enter).

It writes straight into the song's file and only touches the boxes you changed. The cover, lyrics, comments and the file name all stay as they were, and your library updates right away. Clear a box to take that tag out. Boxes you've changed light up and say **EDITED**, and **Esc** or **[ CANCEL ]** gets you out without saving.

You can edit a whole album or a bunch of ticked songs in one go. Boxes that are the same in every song show that value. Boxes that differ say **KEEP**: leave them empty and each song keeps its own, or type something to give it to all of them. Titles and track numbers aren't there, since every song has its own.

If you'd rather have it done for you, **[ AUTO-TAG ]** under the cover sends the songs to the tagger. Editing works on `.mp3`, `.flac` and `.m4a` files, same as the tagger.

### Queue and playlists

**QUEUE** shows what's coming up. Drag **≡** to reorder, **✕** to take a song out, and double-click to jump to it. **[ SAVE AS PLAYLIST ]** turns the queue into a playlist, and your playlists show up in the side menu. Playing a playlist replaces the queue and starts straight away. You can rename, delete and reorder them.

If you turn on **AUTO PLAYLISTS** in the options, three more show up that sort themselves out: **MOST PLAYED** (your top 50), **RECENTLY ADDED** (new songs from the last 30 days) and **NOT PLAYED LATELY** (songs you used to play but haven't in 6 weeks). They update on their own, and **[ SAVE AS PLAYLIST ]** keeps a copy of one as a normal playlist.

### Now playing

There are four looks to pick from in the options, under **NOW PLAYING DISPLAY**:

- **ALBUM ART:** the cover. Click it and a record slides out and spins while the song plays. Click again to put it away.
- **OSCILLOSCOPE:** the sound wave, like an old lab monitor.
- **APERTURE:** the logo's 8 blades push out and back together with the bass, like a speaker.
- **CASSETTE:** a tape deck. The song's cover and name go on the cassette's label, the reels turn and the tape winds across as the song plays, and they whizz for a second when the next song comes on. On the sides there's a VU meter for each channel (with a red **PEAK** light for the loudest hits), a tape counter, and PLAY / PAUSE lights.

Pausing freezes the record, the reels and everything else right where they are. When the song changes, the old title backspaces away and the new one types itself in, like on a terminal.

Under the song you get either **UP NEXT** or the **LYRICS** (pick which one under **UNDER THE SONG** in the options). If the lyrics have timings, the line being sung lights up and they scroll along with the song, and you can click a line to jump there. Lyrics saved in the song's file always come first. If there aren't any, they get downloaded from LRCLIB and kept, so they still show up next time you're offline. If you'd rather it never went online for lyrics, set **LYRICS** to **[ ONLY FROM THE FILE ]**. Downloaded lyrics have a **[ SAVE TO FILE ]** button too, which writes them into the song itself so your phone's music app shows them as well.

### Controls

The player bar at the bottom has shuffle, previous, play/pause, next and repeat (click repeat again for **repeat one**, it shows a little 1), plus the seek bar and volume. **Space** plays and pauses, **Ctrl + ← / →** skips, and your keyboard's media keys work too.

If you turn on the **SLEEP TIMER** in the options, a little moon shows up next to EQ. Pick 15 minutes up to 2 hours, or the end of the song that's playing, and the music fades out and stops on its own.

**Esc** closes whatever popup or menu is open. If nothing is, it takes you back to the screen you were on before (or to Now Playing if there's nowhere to go back to).

### Equalizer

On page **1 // BANDS**, turn it **[ ON ]** and pick 3, 5, 10, 15 or 31 bands. Drag a slider up or down, and double-click it to reset it. Switching the number of bands keeps the shape of your curve.

Page **2 // EFFECTS** has dials for **bass boost**, **surround** (makes the stereo wider) and **channel balance**, plus **stereo / mono**, volume, and a **preamp** (off, headroom to make room for EQ boosts, or a boost). Grab a dial and turn it like a real knob, and double-click to reset it.

### Statistics

**STATISTICS** in the side menu shows how long you've listened in total, how many songs you've played, today, your longest listening session, a chart of minutes per day, and your top artists, albums and genres. Switch between **7 DAYS**, **30 DAYS** and **ALL TIME** at the top.

Right-click a song or album and pick **VIEW STATISTICS** for its own numbers: plays, time listened, first and last played, where it ranks, how often you skipped it, and plays per week.

**MONTHLY REPORTS** writes up a month of your listening like an Aperture test review: your hours (and how that compares to the month before), songs played, songs you played for the first time, your biggest day, your top songs and favourites, when in the day you listen, and a few dry remarks about all of it. When a new month starts, the app tells you last month's report is ready.

Listening time is counted from version 2.0.0 on. Play counts from before that carried over.

### Options

Everything's under **⚙ OPTIONS** at the bottom of the side menu:

- **Music folders** and **[ RESCAN LIBRARY ]**.
- **Now playing display** and **Under the song**, explained above.
- **Lyrics:** download the missing ones, or only use what's in the file.
- **Crossfade:** fades one song into the next, anywhere from 0 to 12 seconds. Some songs are made to run straight into each other though, so you can tick **NO FADE BETWEEN SONGS OF AN ALBUM THAT PLAY IN ORDER**, or use **[ + ADD EXCEPTION ]** for any two songs that should always go straight from one to the other (like Parabol → Parabola). Those play back to back with no fade and no gap. With crossfade off, every song goes straight into the next one with no gap at all.
- **Same loudness:** quiet and loud songs play at about the same volume, so you're not reaching for the volume between songs from different places. Every song gets measured the first time it plays (the next one in the queue gets measured while the current one plays), and a song is never turned up so far that it would crackle.
- **When closing the window:** quit, keep playing in the **tray** by the clock, or switch to a **mini player** you can drag anywhere. It stays on top of other windows unless you unpin it.
- **Screen colour:** amber like the old lab terminals, or blue like the other portal (it's the actual blue portal colour from the game).
- **Cover art colours:** tinted to match the screen, or their original colours. Hovering over a cover always shows its real colours.
- **Window buttons:** on the left or the right. The clock and logo swap sides with them.
- **Hide the mouse:** the pointer disappears after 3, 5 or 10 seconds of not moving over the app (or never), and comes back as soon as you move it.
- **Sleep timer** and **Auto playlists:** show them or hide them, explained above.
- **Boot screen:** the start-up screen, on or off.
- **New versions:** when the app opens it checks GitHub, and if there's a newer version a little note shows up above OPTIONS. Clicking it opens the download page in your browser. The app never downloads anything by itself, and you can switch the check off.

---

## The tagger

You'll find it in the side menu under **TOOLS**. If some songs in your library are missing their tags, **NEEDS TAGGING** shows up in red above it, and **[ SEND TO TAGGER ]** loads them straight in.

Here's what it fixes:

- **Tags:** the right title, artist, album, track number, year and genre.
- **Album cover:** adds the proper cover art.
- **File name:** renames the file to just the song title, so `01. Artist - Song (Official Video) [320kbps].mp3` becomes `Song.mp3`.
- **Artist:** only tags the **main artist**, so songs with features don't end up scattered all over your music app. "Calvin Harris, Dua Lipa" gets tagged as just Calvin Harris.

How to use it:

1. **Add some songs.** Drop `.mp3`, `.flac` or `.m4a` files anywhere on the window, or click **CLICK TO BROWSE** to open the built-in **File Access Terminal**:
   - Click folders to open them. **[ UP ]** goes back a level, and you can type a path into the bar too.
   - Tick the songs you want. Shift-click selects a range, and **[ SELECT ALL ]** grabs the whole folder.
   - **[ ADD WHOLE FOLDER ]** loads every song in the folder. Tick **INCLUDE SUBFOLDERS** to dig into the folders inside it as well.
   - Drag the line between the side list and the files to make the side list wider or narrower.
   - Then hit **[ LOAD ]**. It remembers the last folder you were in.
2. **Click [ SCAN ].** It looks up each song at about 20 songs a minute (the music databases limit how fast it can ask).
3. **Check the results.** Every song shows what it matched and how sure it is (`|||||||||. 94%`).
   - **[ EDIT ]** on a song lets you pick a different match, change any field, or search again with your own text, like `Artist - Song`.
   - Untick a song to leave it out.
   - **VERIFY** means it wasn't completely sure, so give that one a look.
4. **Click [ APPLY ], then [ SAVE ]** and pick one:
   - **Overwrite originals** puts the tagged songs back where they came from, renamed to the clean title. The old files get replaced and **can't be brought back**, so it asks first. Only songs you picked in the file browser can be overwritten, not ones you dragged in. Your playlists and queue follow the renamed files.
   - **New folder:** pick a spot in the same file browser and click **[ SAVE HERE ]**. It makes a folder for each album right there, named after the album. If that album already has a folder, the songs go into it and nothing gets replaced. Your originals stay untouched.

Two options at the bottom of the song list:

- **FEAT. IN TITLE** keeps "(feat. Someone)" in the song title.
- **TRACK # IN FILENAME** names files `05 - Song.mp3` instead of `Song.mp3`.

---

## Good to know

- **Formats:** the player plays `.mp3`, `.flac`, `.m4a`/`.aac`, `.ogg`, `.opus` and `.wav`. The tagger fixes `.mp3`, `.flac` and `.m4a`, and anything else shows up as UNSUPPORTED there. `.wma` and Apple Lossless `.m4a` files can't be played (their tags can still be fixed).
- **Singles:** if a song only came out as a single, the tagger sets its album to the single (like _One Kiss - Single_), so it never ends up under "Unknown Album". If a song is on both an album and a single, it goes with the album.
- **No match:** if the tagger can't find a song, it leaves it alone when saving instead of saving it half-tagged (and won't overwrite it either). Try **[ EDIT ]** and search with the artist and title.
- **The numbers in the small box next to the logo** are your average match confidence in the tagger, songs tagged all-time, and minutes in this session.
- **Change your username** by clicking `User:` at the bottom of the side menu.

---

## Credits

- **Portal, Portal 2, Aperture Science and the Aperture logo** belong to **Valve Corporation**. I'm just a fan. The logo and the terminal look are used here out of love for the game, in a free personal project.
- **Song info** comes from the **iTunes Search API**, with **MusicBrainz** and the **Cover Art Archive** as backup.
- **Lyrics** come from the song's own file, or from [LRCLIB](https://lrclib.net).
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

Tagged copies are written to `%TEMP%\aperture-tunes` while the app runs. Your username, settings, playlists and queue are kept in `%APPDATA%\Aperture Tunes\profile.json`, your listening history in `stats.json`, and the library index, cover cache, downloaded lyrics and song loudness measurements next to them.

</details>
