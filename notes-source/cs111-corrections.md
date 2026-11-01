# CS 111 board: corrections

Every concept on the board was checked against primary sources: man7.org Linux man pages, the Unix V6
source on minnie.tuhs.org, and LWN for the soft-updates write-ordering rules. The board text itself is
unchanged. Each item below appears on `/notes/cs111` as a numbered marker when **Corrections** is on.
Tick the ones you want applied to the board itself.

| # | Where | On the board | Fix | Why | Source | Apply? |
|---|---|---|---|---|---|---|
| 1 | Multiprocessing | kill(process, SIG_KILL) | `int kill(pid_t pid, int sig)`, e.g. `kill(pid, SIGKILL)` | The argument is a pid, and the constant is SIGKILL. | [kill(2)](https://man7.org/linux/man-pages/man2/kill.2.html), [signal(7)](https://man7.org/linux/man-pages/man7/signal.7.html) | ☐ |
| 2 | Multiprocessing | waitpid → returns pid of exited child | Returns the pid of the child whose state changed, 0 with WNOHANG if none has changed, -1 on error. | A change of state isn't always an exit, and there are two more return values. | [wait(2)](https://man7.org/linux/man-pages/man2/wait.2.html) | ☐ |
| 3 | Multiprocessing | -1 for first termination | pid = -1 means wait for **any** child (whichever changes first). 0 means any child in my process group; < -1 means any child in group \|pid\|. | -1 chooses which children to wait for; it isn't a separate mode. | [wait(2)](https://man7.org/linux/man-pages/man2/wait.2.html) | ☐ |
| 4 | Multiprocessing | execvp(const char \*path, char \*argv[]) | `int execvp(const char *file, char *const argv[])`: searches PATH, never returns on success, returns -1 on failure. | The parameter is a file name looked up in PATH, and argv is `char *const[]`. | [exec(3)](https://man7.org/linux/man-pages/man3/exec.3.html) | ☐ |
| 5 | Multiprocessing | i.e. process → finished but not cleared up | This state is a **zombie**. The parent reaps it with waitpid. | Adds the standard name and says what clears it up. | [wait(2)](https://man7.org/linux/man-pages/man2/wait.2.html) | ☐ |
| 6 | OS | Windows, Linux, iOS, Android, Linux | Windows, Linux, macOS, iOS, Android | Linux is listed twice. | n/a | ☐ |
| 7 | System calls | int open (const char \*pathname, int flag) | `int open(const char *pathname, int flags, ... /* mode_t mode */)`; mode is required with O_CREAT. Returns the lowest free fd or -1. | The parameter is flags (plural), and there's a third argument when creating. | [open(2)](https://man7.org/linux/man-pages/man2/open.2.html) | ☐ |
| 8 | System calls | write → returns bytes read, 0 EOF, -1 error | `ssize_t write(int fd, const void *buf, size_t count)` returns bytes **written** or -1. There's no EOF for write. | EOF only applies to read. | [write(2)](https://man7.org/linux/man-pages/man2/write.2.html) | ☐ |
| 9 | Unix V6 explorer (disk layout) | Boot \| Superblock \| Inodes \| **Bitmap** \| Data blocks | V6 is boot \| superblock \| inodes \| data. Free blocks are a **free list** (s_free[]/s_nfree, chained through free blocks); free inodes are cached in s_inode[]. | V6 had no bitmap; bitmaps came later (FFS, ext2). | [filsys.h](https://minnie.tuhs.org/cgi-bin/utree.pl?file=V6/usr/sys/filsys.h), [alloc.c](https://minnie.tuhs.org/cgi-bin/utree.pl?file=V6/usr/sys/ken/alloc.c) | ☐ |
| 10 | Create-file steps | 2. Set bitmap bit for block 876 | In V6, block 876 is popped off the superblock free list. | Same reason as #12. | [alloc.c](https://minnie.tuhs.org/cgi-bin/utree.pl?file=V6/usr/sys/ken/alloc.c) | ☐ |
| 11 | Create-file steps | 5. Write disk and (16, “note.txt”) into free slot | 5. Write the directory entry (16, “note.txt”) into a free slot of the directory block | "disk and" looks like a typo for "dir entry". | [param.h](https://minnie.tuhs.org/cgi-bin/utree.pl?file=V6/usr/sys/param.h) | ☐ |

Removed on 2026-10-19: the old "notes.txt vs note.txt" label marker. The hand-drawn V6 strip and the
inode/block table were replaced by the interactive V6 explorer, which uses note.txt throughout. Its
inode 16 is a small 6-byte file whose block 876 holds “hello!”, matching your create-file steps; the
slide had listed inode 16 as large (size 4608).

Removed on 2026-10-26: the old shared-fd-table sketch (replaced by the fd / open file / vnode diagram) and
the Pipelines notes ("pipe() returns two fds", "dup2 copies over fd"), which are now animated in that diagram's
pipeline tabs with correct captions.

## Checked and correct (no marker)

fork return values (parent gets the child's pid, child gets 0, -1 on failure); "return 124 // timed out"
(the GNU `timeout(1)` convention); system calls switch user → kernel → user; `close` returns 0/-1; fds
0/1/2 are stdin/stdout/stderr and new fds start at the lowest free number; `read` returns bytes / 0 at
EOF / -1, and both read and write can be short; disk is persistent and sector-addressed while RAM is
volatile and byte-addressed; the superblock holds region sizes (s_isize, s_fsize); 512 B blocks, 32 B
inodes (16 per block), the inode table starts at block 2, inode 1 is root; small files use 8 direct
blocks, large ones use 7 singly-indirect blocks plus 1 doubly-indirect; a directory entry is 16 B
(2 B inumber + 14 B name), so 32 fit per block; no journaling in V6; the ordering "data before
inode, directory entry last" is the standard safe ordering.

## Transcription choices you confirmed

- The green note in Multiprocessing reads "i.e. process".
- The note by the fd table is `close(fds[1])`.
- The bubble above Bitmap reads "0 = free, 1 = used".
- The OS bar note reads "Network, I/O".
