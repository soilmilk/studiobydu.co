"use client";

import Stepper, { type CodePanel, type StageProps, type Step } from "./Stepper";
import { ArrowDefs, Fade, ProcBox, Terminal } from "./parts";

const code: CodePanel[] = [
  {
    id: "shell",
    label: "shell.c (simplified)",
    lines: [
      "while (true) {",
      '    printf("$ ");',
      "    char **argv = read_command();   // {\"game\", NULL}",
      "    pid_t pid = fork();",
      "    if (pid == 0) {",
      "        execvp(argv[0], argv);",
      "        exit(1);                    // only reached if exec failed",
      "    }",
      "    waitpid(pid, NULL, 0);",
      "}",
    ],
  },
];

const steps: Step[] = [
  {
    eyebrow: "Read",
    title: "The shell (pid 111) reads a command",
    body: <p>You type <code>game</code>. The shell can't simply become the game, because then nothing would be left to give you the next prompt.</p>,
    code: { shell: [1, 2] },
  },
  {
    eyebrow: "fork()",
    title: "Fork off a child to run it",
    body: (
      <p>
        <code>fork()</code> makes child 112, a copy of the shell. The parent gets back <code>112</code> and the child gets back{" "}
        <code>0</code>.
      </p>
    ),
    code: { shell: [3] },
  },
  {
    eyebrow: "execvp()",
    title: "The child replaces itself with the game",
    body: (
      <>
        <p>
          <code>execvp(&quot;game&quot;, argv)</code> loads the game program into process 112. It keeps the same pid and the same open
          file descriptors, but gets new code and memory.
        </p>
        <p className="note">On success execvp never returns. The exit(1) runs only if the exec failed.</p>
      </>
    ),
    code: { shell: [4, 5, 6] },
  },
  {
    eyebrow: "waitpid()",
    title: "The shell waits for 112",
    body: <p>The parent blocks in <code>waitpid(112, …)</code> while the game runs in the foreground.</p>,
    code: { shell: [8] },
  },
  {
    eyebrow: "Exit",
    title: "The game exits",
    body: <p>Process 112 finishes. Until the shell collects it, it stays a zombie: done, but its exit status is still held for the parent.</p>,
    code: { shell: [8] },
  },
  {
    eyebrow: "Reaped",
    title: "waitpid returns 112, next prompt",
    body: <p>The shell reaps the child, loops around, and prints a fresh <code>$</code> prompt.</p>,
    code: { shell: [8, 0, 1] },
  },
];

const childLabel = ["", "shell (copy)", "game", "game", "game (exited)", ""];
const parentStatus = ["read_command()", "fork() → 112", "fork() → 112", "blocked in waitpid(112)", "blocked in waitpid(112)", "waitpid → 112"];
const childStatus = ["", "fork() → 0", "execvp(\"game\")", "running", "zombie", ""];
const term = [
  [{ t: "$ game", tone: "prompt" }],
  [{ t: "$ game", tone: "prompt" }],
  [{ t: "$ game", tone: "prompt" }],
  [{ t: "$ game", tone: "prompt" }, { t: "[game is running…]", tone: "child" }],
  [{ t: "$ game", tone: "prompt" }, { t: "[game is running…]", tone: "child" }, { t: "[game exited with status 0]", tone: "muted" }],
  [{ t: "$ game", tone: "prompt" }, { t: "[game is running…]", tone: "child" }, { t: "[game exited with status 0]", tone: "muted" }, { t: "$ ", tone: "prompt" }],
] as const;

function Stage({ step, reduced }: StageProps) {
  const blue = "var(--nb-blue)";
  return (
    <svg viewBox="0 0 720 330" className="block h-auto w-full" fontFamily="var(--nb-sans)" role="img" aria-label="Shell forking and running a command">
      <defs>
        <ArrowDefs id="sh-ah" color="var(--nb-ink)" />
        <ArrowDefs id="sh-ahb" color={blue} />
      </defs>
      <ProcBox x={20} y={16} w={260} h={150} title="Shell" sub="pid 111" />
      <text x={40} y={80} fontSize={13} className="fill-neutral-500">parent</text>
      <text x={40} y={130} fontSize={14} fontWeight={600} fontFamily="var(--nb-mono)" className="fill-neutral-800 dark:fill-neutral-200">
        {parentStatus[step]}
      </text>

      <Fade show={step >= 1 && step <= 4} dim={step === 4} reduced={reduced}>
        <path d="M282,60 C340,60 380,60 436,60" fill="none" stroke="var(--nb-ink)" strokeWidth={2} markerEnd="url(#sh-ah)" />
        <text x={360} y={50} fontSize={12} textAnchor="middle" fontFamily="var(--nb-mono)" className="fill-neutral-500">fork()</text>
        <ProcBox x={440} y={16} w={260} h={150} title="Child" sub="pid 112" accent={blue} />
        <text x={460} y={80} fontSize={13} className="fill-neutral-500">program:</text>
        <text x={522} y={80} fontSize={14} fontWeight={650} fontFamily="var(--nb-mono)" fill={blue}>
          {childLabel[step]}
        </text>
        <text x={460} y={130} fontSize={14} fontWeight={600} fontFamily="var(--nb-mono)" className="fill-neutral-800 dark:fill-neutral-200">
          {childStatus[step]}
        </text>
      </Fade>
      <Fade show={step >= 3 && step <= 5} reduced={reduced}>
        <path d="M436,140 C380,140 340,140 284,140" fill="none" stroke={blue} strokeWidth={2} strokeDasharray="5 4" markerEnd="url(#sh-ahb)" />
        <text x={360} y={158} fontSize={11} textAnchor="middle" fill={blue} fontFamily="var(--nb-mono)">waitpid(112)</text>
      </Fade>

      <Terminal x={20} y={186} w={680} h={130} lines={[...term[step]]} reduced={reduced} />
    </svg>
  );
}

export default function ShellStepper() {
  return <Stepper steps={steps} code={code} Stage={Stage} />;
}
