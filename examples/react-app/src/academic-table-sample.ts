// Tiago Sequeira (2022), NeuralFieldEq.jl, JOSS 7(75), 3974. CC BY 4.0.
// https://doi.org/10.21105/joss.03974 — unchanged excerpt, unofficial reproduction.
// paper.md at tiagoseq/NeuralFieldEq.jl@e68d061e4d91e336b326076cb9ffd61bcbeb41b9
export const academicTableSource = String.raw`\begin{table}[H]
\begin{tabular}{c|c|c}
$N$  & 1D     & 2D     \\ \hline
128  & 8.6e-6 & 1.4e-3 \\
256  & 2.1e-5 & 9.2e-3 \\
512  & 3.1e-5 & 3.8e-2 \\
1024 & 6.2e-5 & 0.155  \\
2048 & 1.3e-4 & 0.621  \\
4096 & 2.6e-4 & 2.72
\end{tabular}
\end{table}`;

export const academicTableValues = [
  ['N', '1D', '2D'], ['128', '8.6e-6', '1.4e-3'], ['256', '2.1e-5', '9.2e-3'],
  ['512', '3.1e-5', '3.8e-2'], ['1024', '6.2e-5', '0.155'],
  ['2048', '1.3e-4', '0.621'], ['4096', '2.6e-4', '2.72'],
] as const;
