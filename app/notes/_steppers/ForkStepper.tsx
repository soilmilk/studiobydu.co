"use client";

import Stepper, { type CodePanel, type StageProps, type Step } from "./Stepper";
import { ArrowDefs, Chip, Fade, ProcBox, Terminal } from "./parts";

const code: CodePanel[] = [
  {
    id: "main",
    label: "fork.c",
    lines: [
      "int main(void) {",
      '    printf("Greetings\\n");',
      "    pid_t pid = fork();          // returns twice",
      "    if (pid == 0) {",
      '        printf("child: fork returned %d\\n", pid);',
      "    } else {",
      '        printf("parent: fork returned %d\\n", pid);',
      "        waitpid(pid, NULL, 0);   // reap the child",
      "    }",
      '    printf("Bye-bye\\n");',
      "    return 0;",
      "}",
    ],
  },
];

const steps: Step[] = [
  {
    eyebrow: "Start",
    title: "One process, pid 111",
    body: <p>The program starts as a single process. It prints <code>Greetings</code> before anything else happens.</p>,
    code: { main: [1] },
  },
  {
    eyebrow: "fork()",
    title: "The kernel clones the process",
    body: (
      <>
        <p>
          <code>fork()</code> makes a second process, pid 112. It is a copy of the parent: same code, a copy of memory and
          variables, and a copy of the file descriptor table.
        </p>
        <p className="note">From here on there are two processes running the same program.</p>
      </>
    ),
    code: { main: [2] },
  },
  {
    eyebrow: "Return values",
    title: "fork() returns twice",
    body: (
      <>
        <p>
          In the parent, <code>fork()</code> returns the child's pid, <code>112</code>. In the child it returns <code>0</code>.
          That return value is the only way each copy can tell which one it is.
        </p>
        <p className="note">If fork fails, there is no child and the parent gets -1.</p>
      </>
    ),
    code: { main: [2] },
  },
  {
    eyebrow: "Branch",
    title: "Each copy takes its own branch",
    body: (
      <>
        <p>
          The child sees <code>pid == 0</code> and runs the <code>if</code> branch. The parent runs <code>else</code>.
        </p>
        <p className="note">Both run at the same time, so these two lines can print in either order.</p>
      </>
    ),
    code: { main: [3, 4, 5, 6] },
  },
  {
    eyebrow: "waitpid()",
    title: "The parent waits; the child finishes",
    body: (
      <>
        <p>
          The parent blocks in <code>waitpid(112, …)</code>. The child prints <code>Bye-bye</code> and returns from main, so it
          exits.
        </p>
        <p>
          It is now finished but not cleaned up: a <em>zombie</em>. Its exit status waits in the process table for the parent to collect.
        </p>
      </>
    ),
    code: { main: [7, 9, 10] },
  },
  {
    eyebrow: "Reaped",
    title: "waitpid returns 112 and the parent carries on",
    body: (
      <p>
        <code>waitpid</code> collects the child's exit status and frees its process-table entry. Then the parent prints its own{" "}
        <code>Bye-bye</code>. Every <code>printf</code> after the fork ran twice, once in each process.
      </p>
    ),
    code: { main: [7, 9, 10] },
  },
];

const terminal = [
  [{ t: "Greetings" }],
  [{ t: "Greetings" }],
  [{ t: "Greetings" }],
  [{ t: "Greetings" }, { t: "child: fork returned 0", tone: "child" }, { t: "parent: fork returned 112" }],
  [{ t: "Greetings" }, { t: "child: fork returned 0", tone: "child" }, { t: "parent: fork returned 112" }, { t: "Bye-bye", tone: "child" }],
  [
    { t: "Greetings" },
    { t: "child: fork returned 0", tone: "child" },
    { t: "parent: fork returned 112" },
    { t: "Bye-bye", tone: "child" },
    { t: "Bye-bye" },
  ],
] as const;

const parentStatus = ["running main()", "calling fork()", "fork() returned", "in the else branch", "blocked in waitpid(112)", "reaped 112, printing"];
const childStatus = ["", "new copy of the parent", "fork() returned", "in the if branch", "exited → zombie", "reaped (gone)"];

function Stage({ step, reduced }: StageProps) {
  const blue = "var(--nb-blue)";
  return (
    <svg viewBox="0 0 720 330" className="block h-auto w-full" fontFamily="var(--nb-sans)" role="img" aria-label="Parent and child process after fork">
      <defs>
        <ArrowDefs id="fk-ah" color="var(--nb-ink)" />
      </defs>
      <ProcBox x={20} y={16} w={300} h={170} title="Parent" sub="pid 111" accent="var(--nb-pink)" />
      <text x={40} y={84} fontSize={15} fontFamily="var(--nb-mono)" className="fill-neutral-700 dark:fill-neutral-300">pid =</text>
      {step >= 2 ? <Chip x={92} y={79} text="112" /> : <text x={96} y={84} fontSize={15} className="fill-neutral-400">?</text>}
      <text x={40} y={120} fontSize={13} className="fill-neutral-500">code + memory · fd table</text>
      <text x={40} y={160} fontSize={14} fontWeight={600} className="fill-neutral-800 dark:fill-neutral-200">{parentStatus[step]}</text>

      <Fade show={step >= 1} dim={step >= 5} reduced={reduced}>
        <path d="M322,100 C352,100 368,100 396,100" fill="none" stroke="var(--nb-ink)" strokeWidth={2} markerEnd="url(#fk-ah)" />
        <text x={360} y={90} fontSize={12} textAnchor="middle" fontFamily="var(--nb-mono)" className="fill-neutral-500">fork()</text>
        <ProcBox x={400} y={16} w={300} h={170} title="Child" sub="pid 112" accent="var(--nb-pink)" />
        <text x={420} y={84} fontSize={15} fontFamily="var(--nb-mono)" className="fill-neutral-700 dark:fill-neutral-300">pid =</text>
        {step >= 2 ? <Chip x={472} y={79} text="0" /> : <text x={476} y={84} fontSize={15} className="fill-neutral-400">?</text>}
        <text x={420} y={120} fontSize={13} className="fill-neutral-500">copy of code + memory · fd table</text>
        <text x={420} y={160} fontSize={14} fontWeight={600} fill={step === 4 ? "var(--nb-red)" : undefined} className={step === 4 ? "" : "fill-neutral-800 dark:fill-neutral-200"}>
          {childStatus[step]}
        </text>
      </Fade>
      <Fade show={step === 4} reduced={reduced}>
        <path d="M398,150 C360,150 360,150 324,150" fill="none" stroke={blue} strokeWidth={2} strokeDasharray="5 4" markerEnd="url(#fk-ah)" />
        <text x={360} y={142} fontSize={11} textAnchor="middle" fill={blue}>exit status</text>
      </Fade>

      <Terminal x={20} y={200} w={680} h={120} lines={[...terminal[step]]} reduced={reduced} />
    </svg>
  );
}

export default function ForkStepper() {
  return <Stepper steps={steps} code={code} Stage={Stage} />;
}
