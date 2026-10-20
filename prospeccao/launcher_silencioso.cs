using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;

class PinasSilentLauncher
{
    [STAThread]
    static void Main(string[] args)
    {
        try
        {
            // 1. Identificar pasta base
            string baseDir = "";
            try
            {
                baseDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            }
            catch
            {
                baseDir = AppDomain.CurrentDomain.BaseDirectory;
            }

            string prospeccaoDir = "";
            if (File.Exists(Path.Combine(baseDir, "server.js")))
            {
                prospeccaoDir = baseDir;
            }
            else if (Directory.Exists(Path.Combine(baseDir, "prospeccao")) && File.Exists(Path.Combine(baseDir, "prospeccao", "server.js")))
            {
                prospeccaoDir = Path.Combine(baseDir, "prospeccao");
            }
            else
            {
                string fallback = @"G:\Users\kauek\Desktop\claude\Pinas Scrapping\prospeccao";
                if (File.Exists(Path.Combine(fallback, "server.js")))
                {
                    prospeccaoDir = fallback;
                }
            }

            if (string.IsNullOrEmpty(prospeccaoDir))
            {
                return;
            }

            // 2. Verificar se a porta 3333 ja esta respondendo (servidor ja ativo)
            if (IsPortInUse(3333))
            {
                // Se foi chamado com argumento para abrir no navegador, abre mesmo se ja estiver rodando
                if (args.Length > 0 && args[0].ToLower().Contains("open"))
                {
                    OpenBrowser("http://localhost:3333");
                }
                return;
            }

            // 3. Identificar executavel do Node.js
            string nodeExe = FindNode();
            if (string.IsNullOrEmpty(nodeExe))
            {
                return;
            }

            // 4. Iniciar Node.js em background 100% silencioso
            string logFile = Path.Combine(prospeccaoDir, "server_background.log");

            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c \"\"" + nodeExe + "\" server.js >> \"" + logFile + "\" 2>&1\"",
                WorkingDirectory = prospeccaoDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            // Garantir caminho do Node no PATH do processo
            string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            string nodeDir = Path.GetDirectoryName(nodeExe);
            if (!string.IsNullOrEmpty(nodeDir) && !currentPath.Contains(nodeDir))
            {
                psi.EnvironmentVariables["PATH"] = nodeDir + ";" + currentPath;
            }

            Process.Start(psi);

            // 5. Se foi pedido abertura de navegador (ex: clique manual do usuario)
            if (args.Length > 0 && args[0].ToLower().Contains("open"))
            {
                Thread.Sleep(2000);
                OpenBrowser("http://localhost:3333");
            }
        }
        catch
        {
            // Execucao silenciosa em background
        }
    }

    static bool IsPortInUse(int port)
    {
        try
        {
            using (var client = new TcpClient())
            {
                var result = client.BeginConnect("127.0.0.1", port, null, null);
                bool success = result.AsyncWaitHandle.WaitOne(800);
                if (success && client.Connected)
                {
                    client.EndConnect(result);
                    return true;
                }
            }
        }
        catch { }
        return false;
    }

    static string FindNode()
    {
        string[] candidates = new string[]
        {
            @"C:\Program Files\nodejs\node.exe",
            @"C:\Program Files (x86)\nodejs\node.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\node\node.exe")
        };

        foreach (var c in candidates)
        {
            if (File.Exists(c)) return c;
        }

        try
        {
            Process p = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "node.exe",
                    Arguments = "-v",
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };
            p.Start();
            p.WaitForExit(1000);
            if (p.ExitCode == 0) return "node.exe";
        }
        catch { }

        return null;
    }

    static void OpenBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c start " + url,
                CreateNoWindow = true,
                UseShellExecute = false
            });
        }
        catch { }
    }
}
