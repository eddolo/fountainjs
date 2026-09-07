// Equation excerpts: Tiago Sequeira (2022), NeuralFieldEq.jl, JOSS 7(75), 3974.
// CC BY 4.0: https://doi.org/10.21105/joss.03974
// Pinned source: tiagoseq/NeuralFieldEq.jl@e68d061e4d91e336b326076cb9ffd61bcbeb41b9/JOSS/paper.md
// The two published equation strings are unmodified, including their labels.
export const mathReferenceSamples = [
  { label: 'Editable aligned example', source: String.raw`\begin{aligned}
x_0 &= 1 \\
x_{n+1} &= 2x_n
\end{aligned}`, published: false },
  { label: 'Published equation 1', source: String.raw`\begin{equation}\label{eq:dNFE}
  \alpha \frac{\partial V}{\partial t}\left(\mathbf{x},t\right) = I\left(\mathbf{x},t\right) - V\left(\mathbf{x},t\right) + \int_{\Omega} K\left(||\mathbf{x}-\mathbf{y}||_2\right)S\big[V\left(\mathbf{y},t-d\left(\mathbf{x},\mathbf{y}\right)\right)\big]\,\,d^k\mathbf{y},
\end{equation}`, published: true },
  { label: 'Published equation 2', source: String.raw`\begin{align}\label{eq:dSNFE}
    \alpha\, dV\left(\mathbf{x},t\right) =& \left[I\left(\mathbf{x},t\right) - V\left(\mathbf{x},t\right) + \int_{\Omega}K\left(||\mathbf{x}-\mathbf{y}||_2\right)S\big[V\left(\mathbf{y},t-d\left(\mathbf{x},\mathbf{y}\right)\right)\big]\,\,d^2\mathbf{y}\right]dt + \nonumber \\
    & \epsilon dW\left(\mathbf{x},t\right),
\end{align}`, published: true },
] as const;
