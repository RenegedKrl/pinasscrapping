using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;

class PinasLauncher
{
    static Process nodeProcess = null;

    static void Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.Title = "Pinas Prospector - Sistema Comercial";
        Console.ForegroundColor = ConsoleColor.Green;

        Console.WriteLine("==============================================================");
        Console.WriteLine("  PINAS PROSPECTOR - SISTEMA OPERACIONAL COMERCIAL");
        Console.WriteLine("==============================================================");
        Console.WriteLine("  Responsavel : Kaue - Pinas Studio (@pinas.studio)");
        Console.WriteLine("  WhatsApp    : (11) 94171-3647");
        Console.WriteLine("  Plataforma  : Google Maps Scraper + CRM + WhatsApp Inbox");
        Console.WriteLine("==============================================================");
        Console.WriteLine();

        // 1. Identificar pasta da aplicacao
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

        if (Directory.Exists(Path.Combine(baseDir, "prospeccao")) && File.Exists(Path.Combine(baseDir, "prospeccao", "server.js")))
        {
            prospeccaoDir = Path.Combine(baseDir, "prospeccao");
        }
        else if (File.Exists(Path.Combine(baseDir, "server.js")))
        {
            prospeccaoDir = baseDir;
        }
        else
        {
            // Fallback para caminho fixo do workspace
            string fallback = @"G:\Users\kauek\Desktop\claude\Pinas Scrapping\prospeccao";
            if (Directory.Exists(fallback) && File.Exists(Path.Combine(fallback, "server.js")))
            {
                prospeccaoDir = fallback;
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERRO] Nao foi possivel encontrar a pasta 'prospeccao' com o server.js!");
                Console.WriteLine("Local procurado: " + baseDir);
                Console.WriteLine("\nPressione Enter para sair...");
                Console.ReadLine();
                return;
            }
        }

        // 2. Identificar executavel do Node.js
        string nodeExe = FindNodeExecutable();
        if (string.IsNullOrEmpty(nodeExe))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("[ERRO] Node.js nao foi encontrado no seu computador!");
            Console.WriteLine("Por favor, instale o Node.js em: https://nodejs.org/");
            Console.WriteLine("\nPressione Enter para sair...");
            Console.ReadLine();
            return;
        }

        // 3. Liberar porta 3333 se houver processo zumbi
        FreePort(3333);

        // 4. Abrir navegador apos 2 segundos em segundo plano
        new Thread(() =>
        {
            Thread.Sleep(2000);
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c start http://localhost:3333/?v=8.0",
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                Process.Start(psi);
            }
            catch { }
        }).Start();

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("[STATUS] Iniciando servidor do Pinas Prospector (v8.0)...");
        Console.WriteLine("[ACESSO] Abrindo http://localhost:3333/?v=8.0 no navegador...");
        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.White;
        Console.WriteLine("--------------------------------------------------------------");
        Console.WriteLine(" * O sistema ja esta rodando!");
        Console.WriteLine(" * Mantenha esta janela aberta enquanto utiliza o Prospector.");
        Console.WriteLine(" * Para encerrar o sistema, basta fechar esta janela.");
        Console.WriteLine("--------------------------------------------------------------");
        Console.WriteLine();

        Console.ForegroundColor = ConsoleColor.Gray;

        AppDomain.CurrentDomain.ProcessExit += (s, e) => KillNode();
        Console.CancelKeyPress += (s, e) => KillNode();

        try
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = nodeExe,
                Arguments = "server.js",
                WorkingDirectory = prospeccaoDir,
                UseShellExecute = false
            };

            nodeProcess = Process.Start(psi);
            if (nodeProcess != null)
            {
                nodeProcess.WaitForExit();
                int code = nodeProcess.ExitCode;
                if (code != 0)
                {
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("\n[AVISO] O processo do servidor foi encerrado com codigo " + code);
                    Console.WriteLine("Pressione Enter para fechar esta janela...");
                    Console.ReadLine();
                }
            }
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("\n[ERRO AO INICIAR NODE]: " + ex.Message);
            Console.WriteLine("Pressione Enter para fechar...");
            Console.ReadLine();
        }
    }

    static string FindNodeExecutable()
    {
        // 1. Testar se node esta no PATH
        try
        {
            Process p = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "node.exe",
                    Arguments = "-v",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true
                }
            };
            p.Start();
            p.WaitForExit(1000);
            if (p.ExitCode == 0) return "node.exe";
        }
        catch { }

        // 2. Caminhos padrao no Windows
        string[] candidates = new string[]
        {
            @"C:\Program Files\nodejs\node.exe",
            @"C:\Program Files (x86)\nodejs\node.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\node\node.exe")
        };

        foreach (string candidate in candidates)
        {
            if (File.Exists(candidate))
                return candidate;
        }

        return null;
    }

    static void FreePort(int port)
    {
        try
        {
            Process netstat = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c netstat -aon | findstr :" + port + " | findstr LISTENING",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                }
            };
            netstat.Start();
            string output = netstat.StandardOutput.ReadToEnd();
            netstat.WaitForExit(3000);

            if (!string.IsNullOrEmpty(output))
            {
                string[] lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string line in lines)
                {
                    string[] parts = line.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length > 4)
                    {
                        string pidStr = parts[parts.Length - 1];
                        int pid;
                        if (int.TryParse(pidStr, out pid) && pid > 0)
                        {
                            try
                            {
                                Process tk = Process.Start(new ProcessStartInfo
                                {
                                    FileName = "taskkill.exe",
                                    Arguments = "/F /T /PID " + pid,
                                    UseShellExecute = false,
                                    CreateNoWindow = true
                                });
                                if (tk != null) tk.WaitForExit(2000);
                                Console.WriteLine("[INFO] Encerrado processo zumbi na porta " + port + " (PID " + pid + ")");
                                Thread.Sleep(300);
                            }
                            catch { }
                        }
                    }
                }
            }
        }
        catch { }
    }

    static void KillNode()
    {
        try
        {
            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                nodeProcess.Kill();
            }
        }
        catch { }
    }
}
