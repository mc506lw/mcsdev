---
layout: home

hero:
  name: mcsdev
  text: 终端里的 Minecraft 插件测试服
  tagline: 把「改代码 → 部署 → 重启 → 看日志」压成一条命令。给 Bukkit / Paper / Folia / Leaf 插件开发者。
  actions:
    - theme: brand
      text: 5 分钟快速上手
      link: /get-started/quickstart
    - theme: alt
      text: 我该从哪开始
      link: /get-started/
    - theme: alt
      text: 命令行参考
      link: /reference/cli/

features:
  - title: 一条命令的闭环
    details: mcsdev dev 监视构建产物，产物一变就部署，部署完按策略重启服务器，并确认端口真的能连上才给你打勾。
  - title: 配置进 git
    details: mcsdev.yml 描述「产物从哪来、部署到哪台服、怎么重启」。换机器、换同事、换 CI，读同一份文件得到同一个结果。
  - title: 只碰自己放的文件
    details: 部署记录写在 plugins/.mcsdev-manifest.json。prune 只删这份记录里、且当前配置已不再产出的 jar —— 你手工放进去的插件不会被碰。
  - title: 不接管你的服务器
    details: link 指向一个已存在的服务器目录，mcsdev 只往里放 jar 和触发重启，启停仍然是你的。也可以让它从零建一台。
  - title: 重启，不是热重载
    details: Paper 冷启动几秒。热重载的类加载器残留和状态污染换来的是玄学 bug，不是速度。
  - title: 判断靠内容不靠时间
    details: 「已是最新」按 sha256 比，不按 mtime。gradle build cache 和 git checkout 都会让新产物带着更旧的 mtime。
---
