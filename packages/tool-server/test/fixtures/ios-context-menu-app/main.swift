// One screen with a UIKit button menu and a SwiftUI Menu (what @expo/ui's
// ContextMenu renders). Open either one and compare `describe` with `ui-tree`.
import SwiftUI
import UIKit

struct SwiftUIMenu: View {
  var body: some View {
    Menu("More actions") {
      Button("Share", systemImage: "square.and.arrow.up") {}
      Button("Edit", systemImage: "pencil") {}
      Button("Crop activity", systemImage: "crop") {}
      Button("Delete", systemImage: "trash", role: .destructive) {}
    }
  }
}

final class ViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    let title = UILabel()
    title.text = "Activity"
    title.font = .preferredFont(forTextStyle: .largeTitle)
    let button = UIButton(type: .system)
    button.setTitle("UIKit menu", for: .normal)
    button.showsMenuAsPrimaryAction = true
    button.menu = UIMenu(children: [
      UIAction(title: "Share", image: UIImage(systemName: "square.and.arrow.up")) { _ in },
      UIAction(title: "Edit", image: UIImage(systemName: "pencil")) { _ in },
      UIAction(title: "Crop activity", image: UIImage(systemName: "crop")) { _ in },
      UIAction(title: "Delete", image: UIImage(systemName: "trash"), attributes: .destructive) { _ in },
    ])
    let host = UIHostingController(rootView: SwiftUIMenu())
    addChild(host)
    let stack = UIStackView(arrangedSubviews: [title, button, host.view])
    stack.axis = .vertical
    stack.spacing = 24
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
    ])
    host.didMove(toParent: self)
  }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  func scene(_ scene: UIScene, willConnectTo _: UISceneSession, options _: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    window = UIWindow(windowScene: scene)
    window?.rootViewController = ViewController()
    window?.makeKeyAndVisible()
  }
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _: UIApplication, configurationForConnecting session: UISceneSession,
    options _: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let config = UISceneConfiguration(name: nil, sessionRole: session.role)
    config.delegateClass = SceneDelegate.self
    return config
  }
}
